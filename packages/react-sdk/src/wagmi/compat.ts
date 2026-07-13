import * as actions from "wagmi/actions";
import { getAccount, watchAccount } from "wagmi/actions";

// wagmi v3 renamed getAccount → getConnection
export const getConnection = "getConnection" in actions ? actions.getConnection : getAccount;

// wagmi v3 renamed watchAccount → watchConnection
export const watchConnection =
  "watchConnection" in actions ? actions.watchConnection : watchAccount;
