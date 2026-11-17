-------------------------- MODULE UnshieldRecovery --------------------------
(***************************************************************************)
(* The two-phase unshield of WrappedToken and its recovery pointer.        *)
(*                                                                         *)
(* Code: packages/sdk/src/token/wrapped-token.ts (unshield, unshieldAll,   *)
(* resumeUnshield, getPendingUnshield, #unwrap, #finalizeUnshield,         *)
(* #finalizeUnwrap, #isUnwrapRequestConsumed), the storage helpers in      *)
(* packages/sdk/src/token/pending-unshield.ts, and submitTransaction in    *)
(* packages/sdk/src/utils/submit-transaction.ts.                           *)
(*                                                                         *)
(* One wrapper and one GenericStorage. Each process is one SDK call. A     *)
(* step is one `await` that reads or writes storage or the chain; awaits   *)
(* that touch neither (encrypt, chain-id checks) fold into the next step.  *)
(* JavaScript runs nothing else between two awaits, so other calls         *)
(* (another tab, a second click) interleave only at steps.                 *)
(***************************************************************************)
EXTENDS FiniteSets

CONSTANTS
    Unshields,      \* unshield()/unshieldAll() calls; each one creates its own unwrap request
    Resumers,       \* page loads that call getPendingUnshield() and then resumeUnshield()
    None,           \* model value: no stored pointer, or no request read yet
    StopBeforeSave  \* FALSE assumes phase 1 of an unshield always reaches savePendingUnshield

ASSUME StopBeforeSave \in BOOLEAN
ASSUME Unshields \cap Resumers = {}

Procs    == Unshields \cup Resumers
Requests == Unshields   \* an unwrap request is named after the unshield call that made it

Terminal == {"stopped", "done", "alreadyFinalized", "reportedNone", "foundNone"}

PCs == {"start", "waitUnwrapReceipt", "checkPointer", "clearStale", "resumeReceipt",
        "resumeCheck", "save", "decrypt", "submitFinalize", "waitFinalizeReceipt",
        "checkConsumed", "healClear", "clearDone"} \cup Terminal

VARIABLES
    pc,      \* pc[p]: where SDK call p is in the code
    req,     \* req[p]: the unwrap request that call p works on
    slot,    \* storage key "zama:pending-unshield:<wrapper>": one request, or None
    unwrap,  \* unwrap[r]: on-chain state of request r (unwrapRequester(r) # 0 means "open")
    ftx,     \* ftx[p]: call p's finalizeUnwrap transaction
    saved    \* history: requests whose pointer savePendingUnshield has written

vars == <<pc, req, slot, unwrap, ftx, saved>>

TypeOK ==
    /\ pc \in [Procs -> PCs]
    /\ req \in [Procs -> Requests \cup {None}]
    /\ slot \in Requests \cup {None}
    /\ unwrap \in [Requests -> {"none", "sent", "open", "finalized"}]
    /\ ftx \in [Procs -> {"none", "sent", "ok", "reverted"}]
    /\ saved \subseteq Requests

Init ==
    /\ pc = [p \in Procs |-> "start"]
    /\ req = [p \in Procs |-> IF p \in Unshields THEN p ELSE None]
    /\ slot = None
    /\ unwrap = [r \in Requests |-> "none"]
    /\ ftx = [p \in Procs |-> "none"]
    /\ saved = {}

Go(p, to) == pc' = [pc EXCEPT ![p] = to]

-----------------------------------------------------------------------------
(* Phase 1: #unwrap -> submitTransaction                                    *)

\* signer.writeContract(unwrapContract(...)) returns the unwrap tx hash.
SubmitUnwrap(p) ==
    /\ p \in Unshields
    /\ pc[p] = "start"
    /\ unwrap' = [unwrap EXCEPT ![p] = "sent"]
    /\ Go(p, "waitUnwrapReceipt")
    /\ UNCHANGED <<req, slot, ftx, saved>>

\* Chain: the unwrap tx is mined. _unwrap burns the amount and records the request.
MineUnwrap(r) ==
    /\ unwrap[r] = "sent"
    /\ unwrap' = [unwrap EXCEPT ![r] = "open"]
    /\ UNCHANGED <<pc, req, slot, ftx, saved>>

\* provider.waitForTransactionReceipt returns; #extractUnwrapRequestId reads the id.
UnwrapReceipt(p) ==
    /\ pc[p] = "waitUnwrapReceipt"
    /\ unwrap[p] \in {"open", "finalized"}
    /\ Go(p, "save")
    /\ UNCHANGED <<req, slot, unwrap, ftx, saved>>

-----------------------------------------------------------------------------
(* getPendingUnshield, then resumeUnshield                                  *)

\* loadPendingUnshieldRequest: storage.get of the pointer.
LoadPointer(p) ==
    /\ p \in Resumers
    /\ pc[p] = "start"
    /\ req' = [req EXCEPT ![p] = slot]
    /\ Go(p, IF slot = None THEN "foundNone" ELSE "checkPointer")
    /\ UNCHANGED <<slot, unwrap, ftx, saved>>

\* #isPendingUnshieldConsumed: unwrapRequester(id) reads zero.
PointerConsumed(p) ==
    /\ pc[p] = "checkPointer"
    /\ unwrap[req[p]] = "finalized"
    /\ Go(p, "clearStale")
    /\ UNCHANGED <<req, slot, unwrap, ftx, saved>>

\* The read returns the requester, or the read fails (fail open). The hash is
\* returned, and the user clicks resume: resumeUnshield(hash).
PointerReported(p) ==
    /\ pc[p] = "checkPointer"
    /\ Go(p, "resumeReceipt")
    /\ UNCHANGED <<req, slot, unwrap, ftx, saved>>

\* #clearStoredPendingUnshield("getPendingUnshield"): storage.delete; returns null.
ClearStalePointer(p) ==
    /\ pc[p] = "clearStale"
    /\ slot' = None
    /\ Go(p, "reportedNone")
    /\ UNCHANGED <<req, unwrap, ftx, saved>>

\* resumeUnshield(hash) with a hash the app kept itself (onUnwrapSubmitted, events).
ResumeKnownHash(p, r) ==
    /\ p \in Resumers
    /\ pc[p] = "start"
    /\ unwrap[r] # "none"
    /\ req' = [req EXCEPT ![p] = r]
    /\ Go(p, "resumeReceipt")
    /\ UNCHANGED <<slot, unwrap, ftx, saved>>

\* resumeUnshield: waitForTransactionReceipt(unwrapTxHash) + #extractUnwrapRequestId.
ResumeReceipt(p) ==
    /\ pc[p] = "resumeReceipt"
    /\ unwrap[req[p]] \in {"open", "finalized"}
    /\ Go(p, "resumeCheck")
    /\ UNCHANGED <<req, slot, unwrap, ftx, saved>>

\* resumeUnshield: #isUnwrapRequestConsumed is true.
ResumeSeesFinalized(p) ==
    /\ pc[p] = "resumeCheck"
    /\ unwrap[req[p]] = "finalized"
    /\ Go(p, "healClear")
    /\ UNCHANGED <<req, slot, unwrap, ftx, saved>>

\* #isUnwrapRequestConsumed is false: the request is open, or the read fails.
ResumeProceeds(p) ==
    /\ pc[p] = "resumeCheck"
    /\ Go(p, "save")
    /\ UNCHANGED <<req, slot, unwrap, ftx, saved>>

-----------------------------------------------------------------------------
(* Phase 2: #finalizeUnshield -> #finalizeUnwrap                            *)

\* savePendingUnshield: storage.set of the one pointer key for this wrapper.
Save(p) ==
    /\ pc[p] = "save"
    /\ slot' = req[p]
    /\ saved' = saved \cup {req[p]}
    /\ Go(p, "decrypt")
    /\ UNCHANGED <<req, unwrap, ftx>>

\* sdk.decryption.decryptPublicValues returns the clear amount and the proof.
Decrypt(p) ==
    /\ pc[p] = "decrypt"
    /\ Go(p, "submitFinalize")
    /\ UNCHANGED <<req, slot, unwrap, ftx, saved>>

\* signer.writeContract(finalizeUnwrapContract(...)) broadcasts the finalize tx.
SubmitFinalize(p) ==
    /\ pc[p] = "submitFinalize"
    /\ unwrap[req[p]] = "open"
    /\ ftx' = [ftx EXCEPT ![p] = "sent"]
    /\ Go(p, "waitFinalizeReceipt")
    /\ UNCHANGED <<req, slot, unwrap, saved>>

\* writeContract throws InvalidUnwrapRequest (the request is gone):
\* isInvalidUnwrapRequestRevert is true.
FinalizeRejectedGone(p) ==
    /\ pc[p] = "submitFinalize"
    /\ unwrap[req[p]] = "finalized"
    /\ Go(p, "healClear")
    /\ UNCHANGED <<req, slot, unwrap, ftx, saved>>

\* writeContract throws for another reason (the user rejects, RPC error).
\* submitTransaction wraps it in TransactionRevertedError.
FinalizeRejected(p) ==
    /\ pc[p] = "submitFinalize"
    /\ Go(p, "checkConsumed")
    /\ UNCHANGED <<req, slot, unwrap, ftx, saved>>

\* Chain: finalizeUnwrap deletes the request and pays out the ERC-20.
FinalizeMined(p) ==
    /\ ftx[p] = "sent"
    /\ unwrap[req[p]] = "open"
    /\ unwrap' = [unwrap EXCEPT ![req[p]] = "finalized"]
    /\ ftx' = [ftx EXCEPT ![p] = "ok"]
    /\ UNCHANGED <<pc, req, slot, saved>>

\* Chain: the finalize tx reverts. InvalidUnwrapRequest when another finalize
\* won, or another reason (bad proof, the ERC-20 transfer fails).
FinalizeMinedReverted(p) ==
    /\ ftx[p] = "sent"
    /\ ftx' = [ftx EXCEPT ![p] = "reverted"]
    /\ UNCHANGED <<pc, req, slot, unwrap, saved>>

\* submitTransaction: the receipt reports success.
FinalizeReceiptOk(p) ==
    /\ pc[p] = "waitFinalizeReceipt"
    /\ ftx[p] = "ok"
    /\ Go(p, "clearDone")
    /\ UNCHANGED <<req, slot, unwrap, ftx, saved>>

\* submitTransaction: the receipt reports a revert (TransactionRevertedError,
\* no revert reason), or waitForTransactionReceipt throws (wrapped in
\* TransactionRevertedError) whatever the tx does on-chain.
FinalizeReceiptFails(p) ==
    /\ pc[p] = "waitFinalizeReceipt"
    /\ Go(p, "checkConsumed")
    /\ UNCHANGED <<req, slot, unwrap, ftx, saved>>

\* catch in #finalizeUnshield: #isUnwrapRequestConsumed is true.
ConsumedYes(p) ==
    /\ pc[p] = "checkConsumed"
    /\ unwrap[req[p]] = "finalized"
    /\ Go(p, "healClear")
    /\ UNCHANGED <<req, slot, unwrap, ftx, saved>>

\* catch in #finalizeUnshield: open, or the read fails (fail open). Rethrow.
ConsumedNo(p) ==
    /\ pc[p] = "checkConsumed"
    /\ Go(p, "stopped")
    /\ UNCHANGED <<req, slot, unwrap, ftx, saved>>

\* #clearStoredPendingUnshield, then throw UnshieldAlreadyFinalizedError.
HealClear(p) ==
    /\ pc[p] = "healClear"
    /\ slot' = None
    /\ Go(p, "alreadyFinalized")
    /\ UNCHANGED <<req, unwrap, ftx, saved>>

\* Phase 2 landed: #clearStoredPendingUnshield("unshield").
ClearDone(p) ==
    /\ pc[p] = "clearDone"
    /\ slot' = None
    /\ Go(p, "done")
    /\ UNCHANGED <<req, unwrap, ftx, saved>>

-----------------------------------------------------------------------------
(* The tab closes, or the awaited call throws and the error leaves the SDK  *)
(* call with no storage write (a failed decrypt, a failed unwrap receipt).  *)
Stop(p) ==
    /\ pc[p] \notin Terminal
    /\ StopBeforeSave \/ ~(p \in Unshields /\ pc[p] \in {"waitUnwrapReceipt", "save"})
    /\ Go(p, "stopped")
    /\ UNCHANGED <<req, slot, unwrap, ftx, saved>>

\* Every SDK call has returned or stopped. Keeps end states from reading as deadlocks.
Finished ==
    /\ \A p \in Procs : pc[p] \in Terminal
    /\ UNCHANGED vars

Next ==
    \/ \E p \in Procs :
        \/ SubmitUnwrap(p) \/ UnwrapReceipt(p)
        \/ LoadPointer(p) \/ PointerConsumed(p) \/ PointerReported(p) \/ ClearStalePointer(p)
        \/ ResumeReceipt(p) \/ ResumeSeesFinalized(p) \/ ResumeProceeds(p)
        \/ Save(p) \/ Decrypt(p) \/ SubmitFinalize(p)
        \/ FinalizeRejectedGone(p) \/ FinalizeRejected(p)
        \/ FinalizeMined(p) \/ FinalizeMinedReverted(p)
        \/ FinalizeReceiptOk(p) \/ FinalizeReceiptFails(p)
        \/ ConsumedYes(p) \/ ConsumedNo(p) \/ HealClear(p) \/ ClearDone(p)
        \/ Stop(p)
    \/ \E p \in Procs, r \in Requests : ResumeKnownHash(p, r)
    \/ \E r \in Requests : MineUnwrap(r)
    \/ Finished

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* Rules                                                                    *)

Working(r)  == \E p \in Procs : req[p] = r /\ pc[p] \notin Terminal
Stranded(r) == unwrap[r] = "open" /\ ~Working(r)

\* The documented promise: an unshield that stopped between its two phases
\* can be found with getPendingUnshield(), so the app can offer to resume it.
PendingUnshieldIsDiscoverable ==
    (\E r \in Requests : Stranded(r)) => (slot # None /\ unwrap[slot] = "open")

\* Once the SDK saved the pointer for a request, the pointer stays until that
\* request is finalized on-chain.
PointerKeptAfterSave ==
    \A r \in saved : unwrap[r] = "open" => slot = r

\* The SDK reports "already finalized" (UnshieldAlreadyFinalizedError, or
\* getPendingUnshield clearing the pointer and returning null) only for a
\* request that is finalized on-chain.
NoFalseAlreadyFinalized ==
    \A p \in Procs :
        pc[p] \in {"alreadyFinalized", "reportedNone"} => unwrap[req[p]] = "finalized"

=============================================================================
