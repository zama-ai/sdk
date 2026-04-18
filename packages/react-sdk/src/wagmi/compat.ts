import * as wagmi from "wagmi";
import { useAccount } from "wagmi";
import * as actions from "wagmi/actions";
import { getAccount, watchAccount } from "wagmi/actions";

// wagmi v3 renamed useAccount → useConnection
export const useConnection = "useConnection" in wagmi ? wagmi.useConnection : useAccount;

// wagmi v3 renamed getAccount → getConnection
export const getConnection = "getConnection" in actions ? actions.getConnection : getAccount;

// wagmi v3 renamed watchAccount → watchConnection
export const watchConnection =
  "watchConnection" in actions ? actions.watchConnection : watchAccount;
