export class AbstractBrokerMinimal {
    constructor(host, quotesProvider) {
        this._host = host;
        this._quotesProvider = quotesProvider;
    }
}
