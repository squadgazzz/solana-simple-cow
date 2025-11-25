# Technical Flow Documentation: P2P Token Swap Program

## Table of Contents
1. [Overview](#overview)
2. [Account Architecture](#account-architecture)
3. [Flow 1: Creating an Offer](#flow-1-creating-an-offer)
4. [Flow 2: Accepting an Offer](#flow-2-accepting-an-offer)
5. [Flow 3: Cancelling an Offer](#flow-3-cancelling-an-offer)
6. [PDA Derivation Details](#pda-derivation-details)
7. [Security Considerations](#security-considerations)
8. [Account Lifecycle](#account-lifecycle)

---

## Overview

This document provides a deep technical explanation of how the P2P Token Swap smart contract works on Solana, focusing on:
- **What PDAs are created and why**
- **Account ownership and authority**
- **Step-by-step execution flow**
- **Security mechanisms**

The program implements a Coincidence of Wants (CoW) order book using an escrow pattern where tokens are locked in PDA-controlled vaults.

---

## Account Architecture

### Three Types of PDAs

The program uses three distinct Program Derived Addresses (PDAs), each serving a specific purpose:

#### 1. **UserProfile PDA**
```rust
#[account]
pub struct UserProfile {
    pub authority: Pubkey,    // 32 bytes - wallet that owns this profile
    pub offer_count: u64,     // 8 bytes - counter for generating unique offer IDs
}
// Total: 40 bytes + 8 discriminator = 48 bytes
```

**Seeds:** `["user_profile", user_wallet_pubkey]`

**Purpose:**
- Tracks how many offers a user has created
- Provides a counter for generating unique offer IDs (0, 1, 2, ...)
- One UserProfile per wallet address
- Enables unlimited offers per user without nonce collision

**Why needed:**
- Solana PDAs must have unique seeds to avoid account collision
- Using a counter ensures each offer gets a unique ID
- Without this, users could only create one offer (using just wallet as seed)

#### 2. **Offer PDA**
```rust
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

**Seeds:** `["offer", maker_wallet_pubkey, offer_id_u64_le_bytes]`

**Purpose:**
- Stores all metadata about the swap offer
- Links to the maker's wallet
- Specifies what tokens are being swapped and amounts
- Stores bumps for efficient PDA re-derivation
- Timestamp for tracking and potential expiration logic

**Why needed:**
- On-chain record of the offer terms
- Enables discovery (anyone can query all offer accounts)
- Prevents front-running or terms modification
- Closed after acceptance/cancellation to recover rent

#### 3. **Vault PDA (SPL Token Account)**
```rust
// This is a standard SPL Token Account, not a custom struct
// Owner: Token Program
// Authority: Program PDA (derived address)
```

**Seeds:** `["vault", offer_pubkey, mint_offered_pubkey]`

**Purpose:**
- SPL token account that holds the escrowed tokens
- Authority is controlled by the program (PDA signing)
- Prevents maker from withdrawing tokens without cancelling
- Ensures atomic swaps (tokens locked until swap or cancel)

**Why needed:**
- **Security:** Maker cannot double-spend or withdraw after creating offer
- **Atomicity:** Tokens are guaranteed to be available when taker accepts
- **Trust:** No need to trust the maker - tokens are programmatically locked
- **Rent recovery:** Closed after swap/cancel, rent returned to maker

---

## Flow 1: Creating an Offer

### High-Level Steps
1. User calls `create_offer` with token amounts and mints
2. Program auto-initializes UserProfile if doesn't exist
3. Program creates Offer PDA with metadata
4. Program creates Vault token account (PDA)
5. Tokens transferred from maker to vault
6. UserProfile counter incremented
7. Success!

### Detailed Instruction Flow

#### **Instruction: `create_offer(amount_offered: u64, amount_wanted: u64)`**

**Accounts Required:**
```rust
pub struct CreateOffer<'info> {
    #[account(
        init_if_needed,
        payer = maker,
        space = 8 + 40,
        seeds = [b"user_profile", maker.key().as_ref()],
        bump
    )]
    pub user_profile: Account<'info, UserProfile>,  // UserProfile PDA

    #[account(
        init,
        payer = maker,
        space = 8 + 130,
        seeds = [b"offer", maker.key().as_ref(), &user_profile.offer_count.to_le_bytes()],
        bump
    )]
    pub offer: Account<'info, Offer>,  // Offer PDA

    #[account(
        init,
        payer = maker,
        seeds = [b"vault", offer.key().as_ref(), mint_offered.key().as_ref()],
        bump,
        token::mint = mint_offered,
        token::authority = offer,  // Vault authority is the Offer PDA itself!
    )]
    pub vault: Account<'info, TokenAccount>,  // Vault token account PDA

    #[account(
        mut,
        constraint = maker_token_account.mint == mint_offered.key(),
        constraint = maker_token_account.owner == maker.key()
    )]
    pub maker_token_account: Account<'info, TokenAccount>,  // Maker's token account

    pub mint_offered: Account<'info, Mint>,  // Token mint being offered
    pub mint_wanted: Account<'info, Mint>,   // Token mint wanted

    #[account(mut)]
    pub maker: Signer<'info>,  // Maker's wallet (pays rent, signs transfer)

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}
```

#### **Step-by-Step Execution:**

**Step 1: Auto-initialize UserProfile (if needed)**
```rust
// If UserProfile doesn't exist, `init_if_needed` creates it
if user_profile is empty {
    user_profile.authority = maker.key();
    user_profile.offer_count = 0;
    // Rent paid by maker
}
```
- **Seeds:** `["user_profile", maker_pubkey]`
- **Bump:** Canonical bump (highest bump that creates valid PDA)
- **Space:** 48 bytes (8 discriminator + 40 data)
- **Rent payer:** Maker
- **Why:** Ensures user can create unlimited offers with unique IDs

**Step 2: Create Offer PDA**
```rust
// Using current offer_count (e.g., 0 for first offer)
let offer_id = user_profile.offer_count;  // e.g., 0

// Initialize Offer account
offer.offer_id = offer_id;
offer.maker = maker.key();
offer.mint_offered = mint_offered.key();
offer.mint_wanted = mint_wanted.key();
offer.amount_offered = amount_offered;
offer.amount_wanted = amount_wanted;
offer.vault_bump = vault_bump;  // Saved for later re-derivation
offer.bump = offer_bump;        // Saved for later re-derivation
offer.created_at = Clock::get()?.unix_timestamp;
```
- **Seeds:** `["offer", maker_pubkey, offer_id_bytes]` (e.g., `["offer", maker, [0,0,0,0,0,0,0,0]]`)
- **Bump:** Canonical bump (stored in `offer.bump`)
- **Space:** 138 bytes (8 discriminator + 130 data)
- **Rent payer:** Maker
- **Why:** On-chain record of swap terms, enables discovery

**Step 3: Create Vault Token Account**
```rust
// Vault is an SPL Token Account with:
// - Mint: mint_offered
// - Owner: Token Program
// - Authority: Offer PDA (the vault can only be controlled by program via PDA signing)
```
- **Seeds:** `["vault", offer_pubkey, mint_offered_pubkey]`
- **Bump:** Canonical bump (stored in `offer.vault_bump`)
- **Authority:** The Offer PDA itself! (not the maker, not the program ID)
- **Rent payer:** Maker
- **Why:** Locks tokens under program control, prevents maker withdrawal

**Step 4: Transfer Tokens to Vault**
```rust
// CPI (Cross-Program Invocation) to Token Program
token::transfer(
    CpiContext::new(
        token_program.to_account_info(),
        Transfer {
            from: maker_token_account.to_account_info(),
            to: vault.to_account_info(),
            authority: maker.to_account_info(),  // Maker signs the transfer
        }
    ),
    amount_offered
)?;
```
- **From:** Maker's token account (they own and sign)
- **To:** Vault PDA (program controls)
- **Amount:** `amount_offered` tokens
- **Authorization:** Maker signs (they approve the lock)
- **Why:** Immediately locks tokens, preventing double-spending

**Step 5: Increment Offer Counter**
```rust
// Prepare for next offer
user_profile.offer_count = user_profile
    .offer_count
    .checked_add(1)
    .ok_or(ErrorCode::CounterOverflow)?;  // Safety: prevent overflow
```
- **Purpose:** Next offer will have ID = 1, then 2, etc.
- **Overflow protection:** Checked math prevents u64 overflow
- **Why:** Ensures all future offers have unique IDs

**Step 6: Log Event**
```rust
msg!(
    "Offer {} created: {} {} for {} {}",
    offer.offer_id,
    offer.amount_offered,
    offer.mint_offered,
    offer.amount_wanted,
    offer.mint_wanted
);
```

### **Result After Successful Creation:**

**On-chain state changes:**
1. ✅ **UserProfile PDA** created (if first offer) or updated (counter incremented)
2. ✅ **Offer PDA** created with all swap metadata
3. ✅ **Vault token account** created with tokens locked inside
4. ✅ Maker's token balance decreased by `amount_offered`
5. ✅ Maker's SOL balance decreased by ~0.0062 SOL (rent for 2 accounts + vault)

**Accounts now exist:**
```
UserProfile: Pubkey["user_profile", maker] = { authority: maker, offer_count: 1 }
Offer:       Pubkey["offer", maker, [0,0,0,0,0,0,0,0]] = { offer_id: 0, maker, ... }
Vault:       Pubkey["vault", offer, mint_offered] = TokenAccount { amount: 100000 }
```

---

## Flow 2: Accepting an Offer

### High-Level Steps
1. Taker discovers offer (frontend queries all Offer accounts)
2. Taker calls `accept_offer` with offer ID and maker's address
3. Frontend auto-creates missing ATAs for taker and maker
4. Program verifies offer exists and matches parameters
5. Atomic transfer: vault → taker (offered tokens), taker → maker (wanted tokens)
6. Offer and Vault accounts closed, rent returned to maker
7. Success!

### Detailed Instruction Flow

#### **Instruction: `accept_offer(offer_id: u64)`**

**Accounts Required:**
```rust
pub struct AcceptOffer<'info> {
    #[account(
        mut,
        seeds = [b"offer", maker.key().as_ref(), &offer_id.to_le_bytes()],
        bump = offer.bump,
        has_one = maker,  // Security: verify maker matches
        close = maker     // Close account and return rent to maker
    )]
    pub offer: Account<'info, Offer>,

    #[account(
        mut,
        seeds = [b"vault", offer.key().as_ref(), mint_offered.key().as_ref()],
        bump = offer.vault_bump,
        constraint = vault.mint == mint_offered.key(),
        constraint = vault.owner == token_program.key()
    )]
    pub vault: Account<'info, TokenAccount>,

    /// CHECK: Maker's wallet address (verified via has_one)
    #[account(mut)]
    pub maker: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = maker_token_account_wanted.owner == maker.key(),
        constraint = maker_token_account_wanted.mint == mint_wanted.key()
    )]
    pub maker_token_account_wanted: Account<'info, TokenAccount>,

    #[account(mut)]
    pub taker: Signer<'info>,

    #[account(
        mut,
        constraint = taker_token_account_wanted.owner == taker.key(),
        constraint = taker_token_account_wanted.mint == mint_offered.key()
    )]
    pub taker_token_account_wanted: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = taker_token_account_offered.owner == taker.key(),
        constraint = taker_token_account_offered.mint == mint_wanted.key()
    )]
    pub taker_token_account_offered: Account<'info, TokenAccount>,

    #[account(constraint = mint_offered.key() == offer.mint_offered)]
    pub mint_offered: Account<'info, Mint>,

    #[account(constraint = mint_wanted.key() == offer.mint_wanted)]
    pub mint_wanted: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
```

#### **Step-by-Step Execution:**

**Step 1: Verify Offer Existence and Constraints**
```rust
// Anchor automatically:
// 1. Derives Offer PDA using seeds
// 2. Verifies it exists on-chain
// 3. Deserializes the data
// 4. Checks constraints:
//    - offer.maker == maker.key() (via has_one)
//    - bump matches stored bump
//    - mint addresses match offer metadata
```
- **Security check:** Prevents accepting wrong offer or providing fake accounts
- **Why:** Ensures all terms match what was originally offered

**Step 2: Frontend Transaction Preparation (before program execution)**

The frontend builds a transaction with multiple instructions:

```typescript
const transaction = new Transaction()

// Instruction 1: Create maker's ATA for wanted token (if needed)
transaction.add(
  createAssociatedTokenAccountIdempotentInstruction(
    taker.publicKey,              // payer (taker pays)
    makerTokenAccountWanted,      // address
    maker,                        // owner
    mintWanted                    // mint
  )
)

// Instruction 2: Create taker's ATA for offered token (if needed)
transaction.add(
  createAssociatedTokenAccountIdempotentInstruction(
    taker.publicKey,              // payer
    takerTokenAccountOffered,     // address
    taker.publicKey,              // owner
    mintWanted                    // mint
  )
)

// Instruction 3: Create taker's ATA for wanted token (if needed)
transaction.add(
  createAssociatedTokenAccountIdempotentInstruction(
    taker.publicKey,              // payer
    takerTokenAccountWanted,      // address
    taker.publicKey,              // owner
    mintOffered                   // mint
  )
)

// Instruction 4: Accept offer (program instruction)
transaction.add(acceptOfferInstruction)
```

**Why this is needed:**
- SPL Token Program requires token accounts to exist before transfers
- Creating them in the same transaction ensures atomicity
- Idempotent instructions are safe even if accounts already exist
- Taker pays for all ATA creation (~0.00612 SOL worst case)

**Step 3: Transfer Offered Tokens from Vault to Taker**

This is the critical part! The program must sign with the Offer PDA to authorize the vault transfer:

```rust
// Create PDA seeds for signing
let maker_key = offer.maker.key();
let offer_id_bytes = offer.offer_id.to_le_bytes();
let offer_seeds = &[
    b"offer",
    maker_key.as_ref(),
    offer_id_bytes.as_ref(),
    &[offer.bump],  // Bump stored in offer
];
let signer = &[&offer_seeds[..]];

// CPI to Token Program WITH PDA SIGNING
token::transfer(
    CpiContext::new_with_signer(  // Note: new_with_signer!
        token_program.to_account_info(),
        Transfer {
            from: vault.to_account_info(),           // From: vault
            to: taker_token_account_wanted.to_account_info(),  // To: taker
            authority: offer.to_account_info(),      // Authority: Offer PDA (not a signer!)
        },
        signer  // Program signs on behalf of Offer PDA
    ),
    offer.amount_offered
)?;
```

**Key concepts:**
- **PDA Signing:** Only the program can sign on behalf of its PDAs
- **Authority:** Vault's authority is the Offer PDA, not a wallet
- **Seeds:** Must match exactly what was used to create the Offer PDA
- **Bump:** Stored in `offer.bump` to avoid re-derivation
- **Why:** Without PDA signing, the transfer would fail (no private key for PDA)

**Step 4: Transfer Wanted Tokens from Taker to Maker**

```rust
// Normal transfer - taker signs as a regular signer
token::transfer(
    CpiContext::new(  // Note: regular new, not new_with_signer
        token_program.to_account_info(),
        Transfer {
            from: taker_token_account_offered.to_account_info(),  // From: taker
            to: maker_token_account_wanted.to_account_info(),      // To: maker
            authority: taker.to_account_info(),  // Authority: taker (regular signer)
        }
    ),
    offer.amount_wanted
)?;
```

**Key concepts:**
- **Regular transfer:** Taker is a normal Signer, not a PDA
- **Authorization:** Taker approves via transaction signature
- **Atomicity:** Both transfers succeed or both fail (no partial swaps)
- **Why:** Completes the swap by paying maker

**Step 5: Close Vault Account**

```rust
// Close the vault token account
token::close_account(
    CpiContext::new_with_signer(
        token_program.to_account_info(),
        CloseAccount {
            account: vault.to_account_info(),
            destination: maker.to_account_info(),  // Rent goes to maker
            authority: offer.to_account_info(),    // Vault authority
        },
        signer
    )
)?;
```

**Why close:**
- Recover rent (~0.00203928 SOL)
- Clean up blockchain state
- Prevent account reuse attacks
- Return rent to maker who paid it originally

**Step 6: Close Offer Account (automatic)**

```rust
// Anchor's `close = maker` attribute automatically:
// 1. Transfers all lamports (rent) to maker
// 2. Sets data length to 0
// 3. Sets owner to System Program
// This happens after instruction completes
```

**Why close:**
- Recover rent (~0.00142248 SOL)
- Prevent double-acceptance
- Clean up state
- Return rent to maker

**Step 7: Log Event**

```rust
msg!(
    "Offer {} accepted by {}",
    offer.offer_id,
    taker.key()
);
```

### **Result After Successful Acceptance:**

**On-chain state changes:**
1. ✅ Taker received `amount_offered` tokens (from vault)
2. ✅ Maker received `amount_wanted` tokens (from taker)
3. ✅ Offer account closed (rent returned to maker)
4. ✅ Vault account closed (rent returned to maker)
5. ✅ Maker's SOL balance increased by ~0.00346 SOL (rent recovery)
6. ✅ Taker's SOL balance decreased by ~0.00612 SOL (ATA creation) + tx fee

**Accounts after acceptance:**
```
UserProfile: Still exists { authority: maker, offer_count: 1 }
Offer:       DELETED (closed, rent returned)
Vault:       DELETED (closed, rent returned)
```

---

## Flow 3: Cancelling an Offer

### High-Level Steps
1. Maker decides to cancel their offer
2. Maker calls `cancel_offer` with offer ID
3. Program verifies maker authorization
4. Tokens returned from vault to maker
5. Offer and Vault accounts closed, rent returned to maker
6. Success!

### Detailed Instruction Flow

#### **Instruction: `cancel_offer(offer_id: u64)`**

**Accounts Required:**
```rust
pub struct CancelOffer<'info> {
    #[account(
        mut,
        seeds = [b"offer", maker.key().as_ref(), &offer_id.to_le_bytes()],
        bump = offer.bump,
        has_one = maker,  // Security: only maker can cancel
        close = maker
    )]
    pub offer: Account<'info, Offer>,

    #[account(
        mut,
        seeds = [b"vault", offer.key().as_ref(), mint_offered.key().as_ref()],
        bump = offer.vault_bump
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = maker_token_account.owner == maker.key(),
        constraint = maker_token_account.mint == mint_offered.key()
    )]
    pub maker_token_account: Account<'info, TokenAccount>,

    pub mint_offered: Account<'info, Mint>,

    #[account(mut)]
    pub maker: Signer<'info>,  // Must be the original offer creator

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
```

#### **Step-by-Step Execution:**

**Step 1: Verify Authorization**

```rust
// Anchor's `has_one = maker` constraint ensures:
// offer.maker == maker.key()
// This prevents anyone else from cancelling the offer
```

**Why important:**
- Security: Prevents takers from cancelling makers' offers
- Authorization: Only the person who locked the tokens can unlock them
- Safety: Protects against griefing attacks

**Step 2: Transfer Tokens from Vault Back to Maker**

```rust
// PDA signing (same as accept_offer)
let maker_key = offer.maker.key();
let offer_id_bytes = offer.offer_id.to_le_bytes();
let offer_seeds = &[
    b"offer",
    maker_key.as_ref(),
    offer_id_bytes.as_ref(),
    &[offer.bump],
];
let signer = &[&offer_seeds[..]];

// Transfer tokens from vault to maker
token::transfer(
    CpiContext::new_with_signer(
        token_program.to_account_info(),
        Transfer {
            from: vault.to_account_info(),
            to: maker_token_account.to_account_info(),  // Back to maker
            authority: offer.to_account_info(),
        },
        signer
    ),
    vault.amount  // All tokens in vault
)?;
```

**Key points:**
- Returns full amount that was locked
- Uses PDA signing (program controls vault)
- Maker gets their tokens back
- Atomic operation

**Step 3: Close Vault Account**

```rust
// Same as in accept_offer
token::close_account(
    CpiContext::new_with_signer(
        token_program.to_account_info(),
        CloseAccount {
            account: vault.to_account_info(),
            destination: maker.to_account_info(),
            authority: offer.to_account_info(),
        },
        signer
    )
)?;
```

**Step 4: Close Offer Account (automatic)**

```rust
// `close = maker` automatically closes and returns rent
```

**Step 5: Log Event**

```rust
msg!("Offer {} cancelled", offer.offer_id);
```

### **Result After Successful Cancellation:**

**On-chain state changes:**
1. ✅ Maker received their tokens back (from vault)
2. ✅ Offer account closed (rent returned to maker)
3. ✅ Vault account closed (rent returned to maker)
4. ✅ Maker's SOL balance increased by ~0.00346 SOL (rent recovery)

---

## PDA Derivation Details

### How PDAs Work

**PDA = Program Derived Address**
- Deterministic public keys derived from seeds + program ID
- No private key exists (only program can "sign")
- Enables program-controlled accounts

**Derivation Formula:**
```rust
let (pda, bump) = Pubkey::find_program_address(
    &[seed1, seed2, ...],
    &program_id
);
```

**Bump:** A number (0-255) that makes the derived address NOT lie on the ed25519 curve (ensuring no private key exists)

### Detailed Derivation Examples

#### UserProfile PDA
```rust
Seeds: ["user_profile", maker_pubkey]
Program ID: Fqww93pxMsRRk2V83TpPk2GSwKc64cS8ktpXp7TpHi9

Example:
Maker: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
PDA = hash(["user_profile", 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU, 255], program_id)
     (if on curve, try 254, 253, ... until off-curve)
```

**Properties:**
- One UserProfile per wallet
- Same wallet always produces same PDA
- Different wallets produce different PDAs

#### Offer PDA
```rust
Seeds: ["offer", maker_pubkey, offer_id_bytes]
Program ID: Fqww93pxMsRRk2V83TpPk2GSwKc64cS8ktpXp7TpHi9

Example:
Maker: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
Offer ID: 0 → [0,0,0,0,0,0,0,0] (little-endian u64)
Offer ID: 1 → [1,0,0,0,0,0,0,0]
Offer ID: 2 → [2,0,0,0,0,0,0,0]

PDA_0 = hash(["offer", maker, [0,0,0,0,0,0,0,0], bump], program_id)
PDA_1 = hash(["offer", maker, [1,0,0,0,0,0,0,0], bump], program_id)
PDA_2 = hash(["offer", maker, [2,0,0,0,0,0,0,0], bump], program_id)
```

**Properties:**
- Each offer has unique address
- Same maker can create 2^64 offers
- Deterministic: given maker + ID, anyone can derive the address
- Essential for off-chain indexing and discovery

#### Vault PDA
```rust
Seeds: ["vault", offer_pubkey, mint_offered_pubkey]
Program ID: Fqww93pxMsRRk2V83TpPk2GSwKc64cS8ktpXp7TpHi9

Example:
Offer: 5qWZ... (the Offer PDA address)
Mint: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v (USDC)

PDA = hash(["vault", 5qWZ..., EPjFWdd5..., bump], program_id)
```

**Properties:**
- One vault per offer (each offer has unique vault)
- Vault address tied to specific offer + mint
- Authority is the Offer PDA (not the maker!)
- Ensures program control via PDA signing

---

## Security Considerations

### 1. **Authorization Checks**

**Problem:** Prevent unauthorized actions

**Solutions:**
- `has_one = maker` in CancelOffer ensures only maker can cancel
- `Signer<'info>` ensures accounts are signed by wallet holder
- PDA derivation verification prevents fake accounts

### 2. **Constraint Validation**

**Problem:** Ensure correct mints and owners

**Solutions:**
```rust
constraint = maker_token_account.mint == mint_offered.key()
constraint = maker_token_account.owner == maker.key()
```
- Prevents wrong tokens being transferred
- Prevents sending to wrong accounts
- Anchor validates before instruction executes

### 3. **PDA Signing**

**Problem:** Vault authority must be program-controlled

**Solution:**
- Vault authority = Offer PDA (not a wallet)
- Only program can sign on behalf of PDAs
- Prevents maker from withdrawing without cancelling
- Ensures atomic swaps

### 4. **Account Closing**

**Problem:** Prevent account resurrection attacks

**Solution:**
```rust
close = maker  // Sets data to zero, transfers rent
```
- Account data wiped (can't be deserialized)
- Discriminator removed
- Owner set to System Program
- Prevents double-acceptance or double-cancellation

### 5. **Checked Math**

**Problem:** Integer overflow in counter

**Solution:**
```rust
user_profile.offer_count
    .checked_add(1)
    .ok_or(ErrorCode::CounterOverflow)?
```
- Prevents wrapping (2^64 - 1 + 1 = 0)
- Returns error instead of silent overflow
- Protects counter integrity

### 6. **Amount Validation**

**Problem:** Zero-amount offers

**Solution:**
```rust
require!(amount_offered > 0, ErrorCode::InvalidAmount);
require!(amount_wanted > 0, ErrorCode::InvalidAmount);
```
- Prevents spam offers
- Ensures meaningful swaps
- Rejects invalid input early

---

## Account Lifecycle

### Creation → Active → Closed

#### UserProfile
```
Created:  First time user creates an offer (init_if_needed)
Active:   Persists across all user's offers
Closed:   Never (stays forever, or user could close manually)
```

#### Offer
```
Created:  When create_offer is called
Active:   Visible to all users, discoverable via program.account.offer.all()
Closed:   When accepted (by taker) OR cancelled (by maker)
```

#### Vault
```
Created:  When create_offer is called (same transaction)
Active:   Holds escrowed tokens
Closed:   When offer accepted OR cancelled (same transaction)
```

### Rent Economics

**Rent paid (by maker at creation):**
- UserProfile: ~0.00067 SOL (one-time, persists)
- Offer: ~0.00142248 SOL (recovered on close)
- Vault: ~0.00203928 SOL (recovered on close)
- **Total: ~0.00414 SOL per offer** (3.46e-3 recovered on close)

**Rent recovered:**
- Accept: ~0.00346 SOL (Offer + Vault) → returned to maker
- Cancel: ~0.00346 SOL (Offer + Vault) → returned to maker
- UserProfile rent: Not recovered (account persists)

---

## Summary

### Key Takeaways

1. **Three PDAs, Three Purposes:**
   - UserProfile: Counter for unique IDs
   - Offer: Swap metadata storage
   - Vault: Escrow for tokens

2. **Escrow Pattern:**
   - Tokens locked immediately in program-controlled vault
   - Prevents double-spending
   - Ensures atomic swaps

3. **PDA Signing:**
   - Critical for vault transfers
   - Only program can sign for its PDAs
   - Enables trustless escrow

4. **Security First:**
   - Authorization checks (has_one, Signer)
   - Constraint validation (mints, owners)
   - Account closing (prevent resurrection)
   - Checked math (no overflows)

5. **Lifecycle Management:**
   - Accounts created when needed
   - Closed after use (rent recovered)
   - Clean state transitions

This architecture provides a secure, efficient, and scalable P2P token swap mechanism on Solana! 🚀
