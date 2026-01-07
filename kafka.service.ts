import { Kafka, Producer, Consumer, KafkaMessage } from 'kafkajs';
import { logger } from '../utils/logger';

class KafkaService {
  private kafka: Kafka;
  private producer: Producer;
  private consumer: Consumer;
  private static instance: KafkaService;

  private constructor() {
    this.kafka = new Kafka({
      clientId: 'trading-platform',
      brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
      retry: {
        initialRetryTime: 100,
        retries: 8
      }
    });

    this.producer = this.kafka.producer();
    this.consumer = this.kafka.consumer({ groupId: 'trading-group' });
  }

  public static getInstance(): KafkaService {
    if (!KafkaService.instance) {
      KafkaService.instance = new KafkaService();
    }
    return KafkaService.instance;
  }

  public async connect(): Promise<void> {
    try {
      await this.producer.connect();
      await this.consumer.connect();
      logger.info('Connected to Kafka');
    } catch (error) {
      logger.error('Error connecting to Kafka:', error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      await this.producer.disconnect();
      await this.consumer.disconnect();
      logger.info('Disconnected from Kafka');
    } catch (error) {
      logger.error('Error disconnecting from Kafka:', error);
      throw error;
    }
  }

  public async sendMessage(topic: string, message: any): Promise<void> {
    try {
      await this.producer.send({
        topic,
        messages: [{ value: JSON.stringify(message) }],
      });
      logger.debug(`Message sent to topic ${topic}`);
    } catch (error) {
      logger.error(`Error sending message to topic ${topic}:`, error);
      throw error;
    }
  }

  public async subscribe(
    topic: string,
    callback: (message: KafkaMessage) => Promise<void>
  ): Promise<void> {
    await this.consumer.subscribe({ topic, fromBeginning: true });
    
    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          logger.debug(`Received message from topic ${topic}`);
          await callback(message);
        } catch (error) {
          logger.error(`Error processing message from topic ${topic}:`, error);
        }
      },
    });
  }
}

export const kafkaService = KafkaService.getInstance();
