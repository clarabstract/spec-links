// @spec(entities.order.rules.paid-once)
export function payOrder() {}

// @spec(enforces: ["entities.order.rules.has-lines"], serves: ["plans:solution-spec.components.api"])
export function addLine() {}

// @spec(rules.paid-once)
export function local() {}
