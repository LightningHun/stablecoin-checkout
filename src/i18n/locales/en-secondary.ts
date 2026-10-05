export default {
  demo: {
    title: "Demo controls",
    description:
      "Evaluator tools. Reset before exploring another completed payment.",
    orderAmount: "Order amount ({currency})",
    applyAmount: "Apply amount",
    amountHint:
      "Applies to the next quote. Use Change or Reset demo to re-quote.",
    paymentState: "Payment state",
    applyState: "Apply state",
    connection: "Connection",
    faults: {
      healthy: "Healthy",
      http500: "HTTP 500",
      disconnect: "Disconnect",
      slow: "Slow ({seconds} seconds)",
    },
    applyConnection: "Apply connection",
    advanceTime: "Advance {minutes} minutes",
    reset: "Reset demo",
    createSignedLink: "Create signed order link",
    requireSignedLinks: "Require signed links",
    copyLink: "Copy link",
    messages: {
      updated: "Demo updated",
      unavailable: "Demo controls unavailable",
      resetUnconfirmed:
        "Demo reset could not be confirmed. Your checkout has not been restarted.",
    },
  },
  invalidLink: {
    title: "This payment link isn’t valid",
    explanation:
      "We can’t find an order for it, so there is nothing to pay here. Nothing has been charged. If a shop sent you this link, go back and start the payment again — you’ll get a fresh one.",
    goBack: "Go back",
    copyDetails: "Copy details",
    forSupport: "For support",
    reason: "Reason",
    reasonWithCode: "{reason} · {code}",
    orderInLink: "Order in the link",
    opened: "Opened",
    none: "none",
    reasons: {
      malformedOrder: "The order code in the link isn’t valid",
      unknownOrder: "We can’t find an order for this link",
      invalidSignature: "The link’s signature doesn’t match",
      missingSignature: "The link isn’t signed",
      unverified: "The link could not be verified",
    },
    details: {
      reason: "Reason: {reason} · {code}",
      order: "Order in the link: {order}",
      opened: "Opened: {time}",
      link: "Link: {url}",
    },
  },
  merchant: {
    fallbackName: "Merchant",
  },
  transaction: {
    explorerLabel: "Transaction {hash} on {explorer} (opens in a new tab)",
  },
};
