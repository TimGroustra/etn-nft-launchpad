import { Contract } from 'ethers'

export async function safeCall(contract: Contract, method: string, args: unknown[] = []) {
  try {
    const value = await (contract as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[method](
      ...args,
    )
    return { ok: true as const, value }
  } catch (err: unknown) {
    const message =
      (err as { reason?: string; message?: string })?.reason ??
      (err as { message?: string })?.message ??
      String(err)
    const code = (err as { code?: string })?.code
    const isRevertError =
      code === 'CALL_EXCEPTION' ||
      message.includes('missing revert data') ||
      message.includes('execution reverted')

    if (isRevertError) {
      return { ok: false as const, error: 'Token does not exist or contract call failed (revert)', raw: err }
    }
    return { ok: false as const, error: message, raw: err }
  }
}
