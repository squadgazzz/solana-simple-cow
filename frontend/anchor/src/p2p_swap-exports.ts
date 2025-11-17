// Here we export some useful types and functions for interacting with the P2P Swap Anchor program.
import { AnchorProvider, Program } from '@coral-xyz/anchor'
import { Cluster, PublicKey } from '@solana/web3.js'
import P2pSwapIDL from '../idl/p2p_swap.json'
import type { P2pSwap } from '../target/types/p2p_swap'

// Re-export the generated IDL and type
export { P2pSwap, P2pSwapIDL }

// The programId is imported from the program IDL.
export const P2P_SWAP_PROGRAM_ID = new PublicKey(P2pSwapIDL.address)

// This is a helper function to get the P2pSwap Anchor program.
export function getP2pSwapProgram(provider: AnchorProvider, address?: PublicKey): Program<P2pSwap> {
  return new Program({ ...P2pSwapIDL, address: address ? address.toBase58() : P2pSwapIDL.address } as P2pSwap, provider)
}

// This is a helper function to get the program ID for the P2pSwap program depending on the cluster.
export function getP2pSwapProgramId(cluster: Cluster) {
  switch (cluster) {
    case 'devnet':
    case 'testnet':
      // This is the program ID for the P2pSwap program on devnet and testnet.
      return new PublicKey('Fqww93pxMsRRk2V83TpPk2GSwKc64cS8ktpXp7TpHi9')
    case 'mainnet-beta':
    default:
      return P2P_SWAP_PROGRAM_ID
  }
}
