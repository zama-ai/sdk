import { ZamaSDK as Client } from "@zama-fhe/sdk";

class Wallet {
  sdk: Client;

  constructor(config) {
    this.sdk = new Client(config);
  }

  async grant(tokens) {
    return this.sdk.permits.grantPermit(tokens);
  }
}
