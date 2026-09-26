/**
 * DSH-free LexFlow contracts. Only the adapter implementation is allowed to
 * know how these operations are provided by the current harness.
 */

export const LEXFLOW_ADAPTER_CONTRACT_VERSION = 2

export class LexFlowError extends Error {
  constructor(code, message, details = {}, options = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'LexFlowError'
    this.code = code
    this.details = details
  }
}
