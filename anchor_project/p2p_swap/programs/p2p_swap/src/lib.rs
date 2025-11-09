use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, CloseAccount, Mint};

declare_id!("Fqww93pxMsRRk2V83TpPk2GSwKc64cS8ktpXp7TpHi9");

#[program]
pub mod p2p_swap {
    use super::*;

    /// Initialize a new user profile to track offer count
    pub fn initialize_user(ctx: Context<InitializeUser>) -> Result<()> {
        let user_profile = &mut ctx.accounts.user_profile;
        user_profile.authority = ctx.accounts.authority.key();
        user_profile.offer_count = 0;

        msg!("User profile initialized for {}", user_profile.authority);
        Ok(())
    }

    /// Create a new swap offer by locking tokens in escrow
    pub fn create_offer(
        ctx: Context<CreateOffer>,
        amount_offered: u64,
        amount_wanted: u64,
    ) -> Result<()> {
        // Validate amounts
        require!(amount_offered > 0, ErrorCode::InvalidAmount);
        require!(amount_wanted > 0, ErrorCode::InvalidAmount);

        let user_profile = &mut ctx.accounts.user_profile;
        let offer = &mut ctx.accounts.offer;
        let clock = Clock::get()?;

        // Get current offer ID and increment counter
        let offer_id = user_profile.offer_count;
        user_profile.offer_count = user_profile
            .offer_count
            .checked_add(1)
            .ok_or(ErrorCode::CounterOverflow)?;

        // Initialize offer account
        offer.offer_id = offer_id;
        offer.maker = ctx.accounts.maker.key();
        offer.mint_offered = ctx.accounts.mint_offered.key();
        offer.mint_wanted = ctx.accounts.mint_wanted.key();
        offer.amount_offered = amount_offered;
        offer.amount_wanted = amount_wanted;
        offer.vault_bump = ctx.bumps.vault;
        offer.bump = ctx.bumps.offer;
        offer.created_at = clock.unix_timestamp;

        // Transfer tokens from maker to vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.maker_token_account.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.maker.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount_offered)?;

        msg!(
            "Offer {} created: {} {} for {} {}",
            offer_id,
            amount_offered,
            offer.mint_offered,
            amount_wanted,
            offer.mint_wanted
        );

        Ok(())
    }

    /// Accept an offer and execute atomic token swap
    pub fn accept_offer(ctx: Context<AcceptOffer>) -> Result<()> {
        let offer = &ctx.accounts.offer;

        // Validate token mints match the offer
        require!(
            ctx.accounts.mint_offered.key() == offer.mint_offered,
            ErrorCode::InvalidMint
        );
        require!(
            ctx.accounts.mint_wanted.key() == offer.mint_wanted,
            ErrorCode::InvalidMint
        );

        // Transfer wanted tokens from taker to maker
        let cpi_accounts = Transfer {
            from: ctx.accounts.taker_token_account_offered.to_account_info(),
            to: ctx.accounts.maker_token_account_wanted.to_account_info(),
            authority: ctx.accounts.taker.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, offer.amount_wanted)?;

        // Transfer offered tokens from vault to taker using PDA signer
        let offer_key = offer.key();
        let mint_key = offer.mint_offered;
        let seeds = &[
            b"vault",
            offer_key.as_ref(),
            mint_key.as_ref(),
            &[offer.vault_bump],
        ];
        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.taker_token_account_wanted.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, offer.amount_offered)?;

        // Close vault token account (refund rent to maker)
        let cpi_accounts = CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.maker.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::close_account(cpi_ctx)?;

        msg!(
            "Offer {} accepted by {}",
            offer.offer_id,
            ctx.accounts.taker.key()
        );

        Ok(())
    }

    /// Cancel an offer and return tokens to maker
    pub fn cancel_offer(ctx: Context<CancelOffer>) -> Result<()> {
        let offer = &ctx.accounts.offer;

        // Transfer tokens from vault back to maker using PDA signer
        let offer_key = offer.key();
        let mint_key = offer.mint_offered;
        let seeds = &[
            b"vault",
            offer_key.as_ref(),
            mint_key.as_ref(),
            &[offer.vault_bump],
        ];
        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.maker_token_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, offer.amount_offered)?;

        // Close vault token account (refund rent to maker)
        let cpi_accounts = CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.maker.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::close_account(cpi_ctx)?;

        msg!("Offer {} cancelled", offer.offer_id);

        Ok(())
    }
}

// ============================================================================
// Account Structures
// ============================================================================

#[derive(Accounts)]
pub struct InitializeUser<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + UserProfile::SIZE,
        seeds = [b"user_profile", authority.key().as_ref()],
        bump
    )]
    pub user_profile: Account<'info, UserProfile>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateOffer<'info> {
    #[account(
        init,
        payer = maker,
        space = 8 + Offer::SIZE,
        seeds = [
            b"offer",
            maker.key().as_ref(),
            &user_profile.offer_count.to_le_bytes(),
        ],
        bump
    )]
    pub offer: Account<'info, Offer>,

    #[account(
        init,
        payer = maker,
        seeds = [
            b"vault",
            offer.key().as_ref(),
            mint_offered.key().as_ref(),
        ],
        bump,
        token::mint = mint_offered,
        token::authority = vault,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"user_profile", maker.key().as_ref()],
        bump,
        has_one = authority @ ErrorCode::Unauthorized
    )]
    pub user_profile: Account<'info, UserProfile>,

    #[account(
        mut,
        constraint = maker_token_account.mint == mint_offered.key() @ ErrorCode::InvalidMint,
        constraint = maker_token_account.owner == maker.key() @ ErrorCode::Unauthorized,
    )]
    pub maker_token_account: Account<'info, TokenAccount>,

    pub mint_offered: Account<'info, Mint>,
    pub mint_wanted: Account<'info, Mint>,

    #[account(mut)]
    pub maker: Signer<'info>,

    /// CHECK: This is the authority field in user_profile, validated by has_one
    pub authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(offer_id: u64)]
pub struct AcceptOffer<'info> {
    #[account(
        mut,
        seeds = [
            b"offer",
            maker.key().as_ref(),
            &offer_id.to_le_bytes(),
        ],
        bump = offer.bump,
        close = maker,
        has_one = maker @ ErrorCode::Unauthorized,
    )]
    pub offer: Account<'info, Offer>,

    #[account(
        mut,
        seeds = [
            b"vault",
            offer.key().as_ref(),
            mint_offered.key().as_ref(),
        ],
        bump = offer.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// CHECK: Maker will receive rent refund, validated by has_one in offer
    #[account(mut)]
    pub maker: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = maker_token_account_wanted.mint == offer.mint_wanted @ ErrorCode::InvalidMint,
        constraint = maker_token_account_wanted.owner == maker.key() @ ErrorCode::Unauthorized,
    )]
    pub maker_token_account_wanted: Account<'info, TokenAccount>,

    #[account(mut)]
    pub taker: Signer<'info>,

    #[account(
        mut,
        constraint = taker_token_account_wanted.mint == offer.mint_offered @ ErrorCode::InvalidMint,
        constraint = taker_token_account_wanted.owner == taker.key() @ ErrorCode::Unauthorized,
    )]
    pub taker_token_account_wanted: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = taker_token_account_offered.mint == offer.mint_wanted @ ErrorCode::InvalidMint,
        constraint = taker_token_account_offered.owner == taker.key() @ ErrorCode::Unauthorized,
    )]
    pub taker_token_account_offered: Account<'info, TokenAccount>,

    pub mint_offered: Account<'info, Mint>,
    pub mint_wanted: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(offer_id: u64)]
pub struct CancelOffer<'info> {
    #[account(
        mut,
        seeds = [
            b"offer",
            maker.key().as_ref(),
            &offer_id.to_le_bytes(),
        ],
        bump = offer.bump,
        close = maker,
        has_one = maker @ ErrorCode::Unauthorized,
    )]
    pub offer: Account<'info, Offer>,

    #[account(
        mut,
        seeds = [
            b"vault",
            offer.key().as_ref(),
            mint_offered.key().as_ref(),
        ],
        bump = offer.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = maker_token_account.mint == offer.mint_offered @ ErrorCode::InvalidMint,
        constraint = maker_token_account.owner == maker.key() @ ErrorCode::Unauthorized,
    )]
    pub maker_token_account: Account<'info, TokenAccount>,

    pub mint_offered: Account<'info, Mint>,

    #[account(mut)]
    pub maker: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

// ============================================================================
// Account Data Structures
// ============================================================================

#[account]
pub struct UserProfile {
    /// The user's wallet address
    pub authority: Pubkey,    // 32 bytes
    /// Counter for creating unique offer IDs
    pub offer_count: u64,     // 8 bytes
}

impl UserProfile {
    pub const SIZE: usize = 32 + 8;
}

#[account]
pub struct Offer {
    /// Unique offer ID from user's counter
    pub offer_id: u64,        // 8 bytes
    /// Offer creator's wallet
    pub maker: Pubkey,        // 32 bytes
    /// Token mint being offered
    pub mint_offered: Pubkey, // 32 bytes
    /// Token mint being requested
    pub mint_wanted: Pubkey,  // 32 bytes
    /// Amount of offered tokens
    pub amount_offered: u64,  // 8 bytes
    /// Amount of wanted tokens
    pub amount_wanted: u64,   // 8 bytes
    /// PDA bump for vault
    pub vault_bump: u8,       // 1 byte
    /// PDA bump for offer account
    pub bump: u8,             // 1 byte
    /// Creation timestamp
    pub created_at: i64,      // 8 bytes
}

impl Offer {
    pub const SIZE: usize = 8 + 32 + 32 + 32 + 8 + 8 + 1 + 1 + 8;
}

// ============================================================================
// Error Codes
// ============================================================================

#[error_code]
pub enum ErrorCode {
    #[msg("Amount must be greater than zero")]
    InvalidAmount,

    #[msg("Insufficient token balance")]
    InsufficientBalance,

    #[msg("Unauthorized: Only the maker can perform this action")]
    Unauthorized,

    #[msg("Invalid token mint provided")]
    InvalidMint,

    #[msg("Offer counter overflow - maximum offers reached")]
    CounterOverflow,

    #[msg("User profile must be initialized first")]
    UninitializedUserProfile,
}
