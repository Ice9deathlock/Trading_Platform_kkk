import nodemailer from 'nodemailer';
import { createTransport, Transporter } from 'nodemailer';
import path from 'path';
import fs from 'fs';
import handlebars from 'handlebars';
import { logger } from '../utils/logger';

interface EmailOptions {
  to: string;
  subject: string;
  template: string;
  context: Record<string, any>;
}

class EmailService {
  private transporter: Transporter;
  private templatesDir: string;

  constructor() {
    // Initialize nodemailer transporter
    this.transporter = createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USERNAME,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    // Set templates directory
    this.templatesDir = path.join(__dirname, '../../templates/emails');
    
    // Register handlebars helpers
    this.registerHelpers();
  }

  // Register custom handlebars helpers
  private registerHelpers() {
    // Format date helper
    handlebars.registerHelper('formatDate', (date: Date) => {
      return new Date(date).toLocaleDateString();
    });

    // Uppercase first letter helper
    handlebars.registerHelper('uppercaseFirst', (str: string) => {
      return str.charAt(0).toUpperCase() + str.slice(1);
    });
  }

  // Compile email template
  private async compileTemplate(templateName: string, context: any): Promise<string> {
    try {
      const templatePath = path.join(this.templatesDir, `${templateName}.hbs`);
      const templateContent = await fs.promises.readFile(templatePath, 'utf-8');
      const template = handlebars.compile(templateContent);
      return template(context);
    } catch (error) {
      logger.error('Error compiling email template:', error);
      throw new Error(`Failed to compile email template: ${templateName}`);
    }
  }

  // Send email
  async sendEmail(options: EmailOptions): Promise<void> {
    const { to, subject, template, context } = options;

    try {
      // Compile email template
      const html = await this.compileTemplate(template, context);
      
      // Setup email data
      const mailOptions = {
        from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM_ADDRESS}>`,
        to,
        subject,
        html,
      };

      // Send email
      await this.transporter.sendMail(mailOptions);
      logger.info(`Email sent to ${to}`);
    } catch (error) {
      logger.error('Error sending email:', error);
      throw new Error('Failed to send email');
    }
  }

  // Send verification email
  async sendVerificationEmail(email: string, name: string, token: string): Promise<void> {
    const verificationUrl = `${process.env.CLIENT_URL}/verify-email?token=${token}`;
    
    await this.sendEmail({
      to: email,
      subject: 'Verify Your Email',
      template: 'verify-email',
      context: {
        name,
        verificationUrl,
        year: new Date().getFullYear(),
      },
    });
  }

  // Send password reset email
  async sendPasswordResetEmail(email: string, name: string, token: string): Promise<void> {
    const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${token}`;
    
    await this.sendEmail({
      to: email,
      subject: 'Reset Your Password',
      template: 'reset-password',
      context: {
        name,
        resetUrl,
        year: new Date().getFullYear(),
      },
    });
  }

  // Send welcome email
  async sendWelcomeEmail(email: string, name: string): Promise<void> {
    await this.sendEmail({
      to: email,
      subject: 'Welcome to Our Platform!',
      template: 'welcome',
      context: {
        name,
        loginUrl: `${process.env.CLIENT_URL}/login`,
        year: new Date().getFullYear(),
      },
    });
  }
}

// Create a singleton instance
export const emailService = new EmailService();

export default emailService;
