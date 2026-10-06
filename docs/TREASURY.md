# Treasury

platform_revenue_records records qualifying source, input mint, exact raw revenue, optional
allocation BPS/raw amount, mock flag and originating payment intent. NPC receipts qualify;
only actual marketplace fees qualify. Gross seller sales do not. CADENCE_BUYBACK_BPS unset
means no assumed policy/percentage and no allocation queue.

cadence_buyback_records holds queued allocations and reviewed acquisition/burn signatures,
spent/acquired/burned amounts and verification timestamp. The web server never signs or
trades treasury funds. Mock entries are visibly separate and cannot be recorded as real burns.

After externally authorized execution, `npm run treasury:record -- QUEUE_ID DEX_SIGNATURE
BURN_SIGNATURE` verifies finalized transactions: reviewed CADENCE_DEX_PROGRAM_ID was called,
treasury signed, configured input token spend is within allocation, configured $CADENCE was
acquired, and a later checked burn has matching mint/authority/raw balance decrease. Signatures
are unique. Only verified records appear as completed burns at /treasury; queued allocation is
not a burn. No buyback or burn was executed during this pass.

The recorder supports a direct treasury signer and direct MOCHI-to-CADENCE swap. Multisig
adapter, acquisition provenance/reconciliation review and production admin role workflow need
implementation. Operator review must link the selected allocation to actual acquisition; no
unattended execution exists. Legal/compliance review is a launch requirement. No appreciation,
yield, profit or financial return is promised.
