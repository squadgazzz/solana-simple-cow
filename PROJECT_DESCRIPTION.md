# Project Description

**Deployed Frontend URL:** https://solana-simple-cow.vercel.app/p2p-swap

**Solana Program ID:** `Fqww93pxMsRRk2V83TpPk2GSwKc64cS8ktpXp7TpHi9`

**Solscan (Devnet):** https://solscan.io/account/Fqww93pxMsRRk2V83TpPk2GSwKc64cS8ktpXp7TpHi9?cluster=devnet

## Project Overview

### Description
A decentralized peer-to-peer token swap platform built on Solana, implementing a Coincidence of Wants (CoW) order book system. Users can create swap offers by locking tokens in escrow and browse offers from other users to execute atomic token swaps. The platform uses an escrow-based approach where tokens are secured in PDA-controlled vaults until the swap is completed or cancelled, ensuring trustless and atomic exchanges between any SPL tokens on the Solana blockchain.

### Key Features
- **Create Swap Offers**: Lock SPL tokens in escrow and specify what tokens you want in return
- **Browse All Offers**: View all available swap offers from other users in a convenient table
- **Atomic Swaps**: Execute trustless token exchanges in a single transaction
- **Cancel Offers**: Retrieve locked tokens from escrow at any time
- **Auto-Initialization**: User profiles are automatically created on first offer creation
- **Auto-Token Account Detection**: Token accounts are automatically derived from wallet addresses
- **Multiple Offers per User**: Create unlimited swap offers with unique IDs
- **Escrow Security**: Tokens locked in PDA-controlled vaults, eliminating counterparty risk

### How to Use the dApp

1. **Connect Wallet** - Connect your Solana wallet (Phantom, Solflare, etc.) to Devnet
2. **Get Test Tokens**:
   - Visit https://faucet.solana.com/ to get Devnet SOL
   - Create test SPL tokens using `spl-token create-token --url devnet`
   - Or use existing Devnet tokens like USDC-Dev, where airdrops can be done on faucets, like https://faucet.circle.com/
3. **Create an Offer**:
   - Click "Create Offer" tab
   - Enter the token mint address you want to offer
   - Enter amount in base units (e.g., 1000000 for 1 USDC with 6 decimals)
   - Enter the token mint address you want in return
   - Enter the amount you want to receive
   - Click "Create Offer" - your token account is automatically detected!
4. **Browse Offers**:
   - Click "Browse Offers" tab
   - View all available swap offers in the table
   - See offered amounts, wanted amounts, and maker addresses
5. **Accept an Offer**:
   - Click "Accept" button on any offer
   - All token accounts are automatically derived
   - Confirm the transaction in your wallet
   - Tokens are atomically swapped!
6. **Cancel Your Offer**:
   - Find your offer in the list
   - Cancel to retrieve your tokens from escrow

## Program Architecture

The P2P Token Swap program uses a sophisticated architecture with three types of PDAs, four core instructions, and an escrow-based swap mechanism. The program ensures atomicity through Solana's transaction model and security through PDA-controlled token vaults.

### PDA Usage

The program uses three types of Program Derived Addresses to manage user state, offers, and token escrow:

**PDAs Used:**

1. **UserProfile PDA**:
   - Seeds: `["user_profile", user_wallet_pubkey]`
   - Purpose: Tracks each user's offer count for unique offer ID generation
   - Auto-initialized on first offer creation using `init_if_needed`
   - Stores: authority (wallet), offer_count (u64)

2. **Offer PDA**:
   - Seeds: `["offer", maker_wallet_pubkey, offer_id_u64_le_bytes]`
   - Purpose: Stores offer metadata including mints, amounts, and creation timestamp
   - Each user can create unlimited offers with incrementing IDs (0, 1, 2, ...)
   - Ensures deterministic addressing and uniqueness per user

3. **Vault PDA**:
   - Seeds: `["vault", offer_pubkey, mint_offered_pubkey]`
   - Purpose: SPL token account that holds escrowed tokens until swap or cancellation
   - Authority: The program itself (PDA signing)
   - Ensures tokens are locked and can only be released by program instructions

### Program Instructions

**Instructions Implemented:**

1. **initialize_user**:
   - Creates a UserProfile account for a user
   - Sets initial offer_count to 0
   - Note: This instruction still exists but is optional - user profiles are auto-initialized in create_offer

2. **create_offer**:
   - Auto-initializes UserProfile if it doesn't exist (using `init_if_needed`)
   - Creates an Offer PDA with unique ID based on user's offer_count
   - Creates a Vault PDA to hold escrowed tokens
   - Transfers tokens from maker's token account to vault
   - Increments user's offer_count for next unique ID
   - Validates: amounts > 0, sufficient token balance
   - Stores: offer metadata (mints, amounts, maker, timestamps, bumps)

3. **accept_offer**:
   - Validates the offer exists and matches provided data
   - Atomically executes two token transfers:
     - Transfers offered tokens from vault to taker
     - Transfers wanted tokens from taker to maker
   - Closes the offer and vault accounts
   - Returns rent to maker
   - Validates: correct mints, sufficient balances, account ownership

4. **cancel_offer**:
   - Validates caller is the offer maker (authorization check)
   - Returns escrowed tokens from vault to maker
   - Closes offer and vault accounts
   - Returns rent to maker
   - Prevents: non-makers from cancelling others' offers

### Account Structures

```rust
// User profile tracking offer count for unique IDs
#[account]
pub struct UserProfile {
    pub authority: Pubkey,    // 32 bytes - wallet that owns this profile
    pub offer_count: u64,     // 8 bytes - counter for generating unique offer IDs
}
// Total: 40 bytes + 8 discriminator = 48 bytes

// Offer metadata stored on-chain
#[account]
pub struct Offer {
    pub offer_id: u64,          // 8 bytes - unique ID per user (0, 1, 2, ...)
    pub maker: Pubkey,          // 32 bytes - wallet that created the offer
    pub mint_offered: Pubkey,   // 32 bytes - SPL token mint being offered
    pub mint_wanted: Pubkey,    // 32 bytes - SPL token mint wanted in return
    pub amount_offered: u64,    // 8 bytes - amount of offered tokens (base units)
    pub amount_wanted: u64,     // 8 bytes - amount of wanted tokens (base units)
    pub vault_bump: u8,         // 1 byte - PDA bump for vault derivation
    pub bump: u8,               // 1 byte - PDA bump for offer derivation
    pub created_at: i64,        // 8 bytes - Unix timestamp of offer creation
}
// Total: 130 bytes + 8 discriminator = 138 bytes
```

### Error Codes

```rust
#[error_code]
pub enum ErrorCode {
    #[msg("Amount must be greater than zero")]
    InvalidAmount,           // 6000

    #[msg("Offer counter overflow")]
    CounterOverflow,         // 6001

    #[msg("Unauthorized: you are not the maker of this offer")]
    Unauthorized,            // 6002

    #[msg("Invalid token mint provided")]
    InvalidMint,            // 6003
}
```

## Testing

### Test Coverage

Comprehensive test suite with 12 tests covering all instructions with both happy and unhappy paths. All tests validate proper account creation, state transitions, token transfers, and error handling.

**Happy Path Tests:**

1. **Initialize User Profile**: Successfully creates a UserProfile account with offer_count = 0
2. **Initialize Taker Profile**: Creates a second user profile for testing multi-user scenarios
3. **Create First Offer**:
   - Creates offer with ID 0
   - Locks 100,000 tokens in vault
   - Increments offer_count to 1
   - Stores correct metadata (mints, amounts, maker, timestamp)
4. **Create Second Offer**:
   - Same user creates another offer with ID 1
   - Validates counter increment works correctly
   - Proves multiple offers per user functionality
5. **Cancel Offer**:
   - Maker successfully cancels their own offer
   - Tokens returned from vault to maker
   - Offer and vault accounts closed
   - Rent returned to maker
6. **Accept Offer**:
   - Taker successfully accepts maker's offer
   - Atomic swap: offered tokens → taker, wanted tokens → maker
   - Accounts closed and rent returned
   - Validates correct token amounts transferred
7. **Full End-to-End Swap Flow**:
   - Complete workflow from offer creation to acceptance
   - Validates all state transitions
   - Checks final token balances match expected amounts

**Unhappy Path Tests:**

1. **Initialize User Twice**:
   - Fails when trying to create UserProfile that already exists
   - Validates Anchor's account initialization protection
2. **Create Offer with Zero Amount Offered**:
   - Rejects offer creation with amount_offered = 0
   - Validates InvalidAmount error is thrown
3. **Create Offer with Zero Amount Wanted**:
   - Rejects offer creation with amount_wanted = 0
   - Ensures both amounts must be positive
4. **Cancel Offer by Non-Maker**:
   - Different user tries to cancel someone else's offer
   - Fails with Unauthorized error
   - Validates maker-only cancellation security
5. **Accept Offer with Wrong Mint**:
   - Taker provides incorrect token mint addresses
   - Transaction fails due to account constraint violations
   - Prevents token type mismatches

### Running Tests

```bash
# Navigate to program directory
cd anchor_project/p2p_swap

# Install dependencies
yarn install

# Run all tests (12 tests, all passing)
anchor test

# Test output summary:
# ✓ Successfully initializes user profile (460ms)
# ✓ Cannot initialize user profile twice
# ✓ Successfully initializes taker user profile (461ms)
# ✓ Successfully creates first offer (463ms)
# ✓ Rejects offer with zero amount_offered
# ✓ Rejects offer with zero amount_wanted
# ✓ Successfully creates second offer (444ms)
# ✓ Successfully cancels offer by maker (465ms)
# ✓ Rejects cancel by non-maker
# ✓ Successfully accepts offer with atomic swap (494ms)
# ✓ Rejects accept with wrong token mints (461ms)
# ✓ Complete end-to-end swap works correctly (921ms)
```

## Frontend Implementation

### Technologies Used

- **Framework**: Next.js 15.5.3 with App Router
- **Styling**: Tailwind CSS + shadcn/ui components
- **Solana Integration**:
  - `@solana/web3.js` for blockchain interactions
  - `@solana/wallet-adapter-react` for wallet connections
  - `@solana/spl-token` for token account derivation
  - `@coral-xyz/anchor` for program interactions
- **State Management**: TanStack Query (React Query) for data fetching and caching
- **UI Components**: Custom components with Card, Table, Button, Input from shadcn/ui

### Frontend Features

1. **Two-Tab Interface**:
   - Create Offer: Simple form for creating swap offers
   - Browse Offers: Table view of all available offers

2. **Auto-Token Account Detection**:
   - Uses `getAssociatedTokenAddress()` to automatically derive token accounts
   - Eliminates manual address entry for better UX
   - Validates token accounts exist before submission
   - Helpful error messages if accounts are missing

3. **Real-Time Data**:
   - Fetches all offers using `program.account.offer.all()`
   - Auto-refreshes after transactions
   - Shows loading states during operations

4. **Wallet Integration**:
   - Supports all Solana wallet adapters (Phantom, Solflare, etc.)
   - Connects to Devnet by default
   - Transaction toast notifications with Solscan links

5. **User-Friendly Input**:
   - Clear labels and placeholders
   - Helpful hints about base units (e.g., "1 SOL = 1000000000 lamports")
   - Amount explanations for different token decimals
   - One-click offer acceptance

### Project Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # Landing page with project info
│   │   └── p2p-swap/page.tsx          # Main swap application page
│   ├── components/
│   │   ├── p2p-swap/
│   │   │   ├── p2p-swap-feature.tsx   # Main component with tabs
│   │   │   ├── p2p-swap-data-access.tsx  # Anchor program hooks
│   │   │   └── p2p-swap-ui.tsx        # UI components (Create, Browse)
│   │   ├── ui/                         # shadcn/ui components
│   │   └── ...
│   └── ...
├── anchor/
│   ├── src/p2p_swap-exports.ts        # Program exports
│   └── target/idl/p2p_swap.json       # Program IDL
└── package.json
```

## Technical Implementation Details

### Escrow Pattern vs Delegation

The program uses an **escrow pattern** where tokens are immediately transferred to a PDA-controlled vault upon offer creation, rather than using token delegation/approval. This approach provides:
- **Immediate locking**: Tokens are secured instantly
- **No collision risk**: Each offer has its own unique vault
- **Atomicity guarantee**: Transfers happen in single transaction
- **Standard pattern**: Widely used in Solana DeFi (Jupiter, Raydium)

### Counter-Based Unique IDs

Offers are identified using a counter-based approach (0, 1, 2, ...) per user, providing:
- **Unlimited throughput**: No nonce exhaustion issues
- **Deterministic addressing**: Easy PDA derivation
- **No collisions**: Each user has independent counter
- **Scalability**: Simple increment operation

### Auto-Initialization Feature

User profiles use `init_if_needed` in the `create_offer` instruction:
- **Better UX**: Users don't need separate initialization step
- **Gas efficient**: Only pays once when actually needed
- **Safe**: Anchor's `init_if_needed` prevents re-initialization attacks
- **Professional**: Matches UX of modern Solana dApps

### Security Considerations

1. **Authorization**: Offer cancellation validates `maker == signer`
2. **Mint Validation**: Checks in accept_offer ensure correct token types
3. **Amount Validation**: Rejects zero-amount offers
4. **PDA Signing**: Vault authority is program-derived, preventing unauthorized transfers
5. **Atomicity**: All swaps succeed or fail as a unit, no partial states
6. **Account Constraints**: Anchor's `has_one` and `constraint` macros enforce relationships

## Deployment Information

### Devnet Deployment

- **Network**: Solana Devnet
- **Program ID**: `Fqww93pxMsRRk2V83TpPk2GSwKc64cS8ktpXp7TpHi9`
- **Deployment Date**: November 2025
- **Cluster**: https://api.devnet.solana.com
- **Explorer**: https://solscan.io/account/Fqww93pxMsRRk2V83TpPk2GSwKc64cS8ktpXp7TpHi9?cluster=devnet

### Testing on Devnet

1. Get Devnet SOL: https://faucet.solana.com/
2. Create test tokens:
   ```bash
   spl-token create-token --url devnet
   spl-token create-account <mint> --url devnet
   spl-token mint <mint> 1000000000 --url devnet
   ```
3. Use Wrapped SOL for testing:
   ```bash
   spl-token wrap 1 --url devnet
   # Mint: So11111111111111111111111111111111111111112
   ```

### Additional Notes for Evaluators

This P2P Token Swap platform was built to explore advanced Solana concepts including PDAs, escrow patterns, and atomic token swaps. The implementation focuses on security, user experience, and professional-grade architecture.

**Key Design Decisions:**
- **Escrow over delegation**: Chosen for simplicity and security
- **Counter-based IDs**: Selected for unlimited scalability
- **Auto-initialization**: Improves UX by eliminating setup steps
- **Auto-token account detection**: Matches modern dApp standards

**Challenges Overcome:**
- Understanding PDA seed derivation for unique offer identification
- Implementing proper CPI for token transfers with PDA signing
- Managing account lifetimes and rent optimization
- Handling Anchor type generation issues with `accountsPartial()`
- Building user-friendly frontend with automatic token account derivation

**Future Enhancements:**
- Add decimal conversion in UI for human-readable amounts
- Implement offer filtering and search
- Add price ratio calculations and sorting
- Support for partial fills
- On-chain offer expiration
- Offer history and analytics

The project demonstrates a production-ready swap mechanism suitable for any SPL token pairs on Solana.
