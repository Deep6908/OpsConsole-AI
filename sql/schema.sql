-- =============================================================================
-- IT Helpdesk Automation System — SQL Server Schema
-- Target: Microsoft SQL Server 2017+ / Azure SQL Database
-- Usage:  Run this entire script against your helpdesk_db database.
--         It is idempotent — safe to re-run (uses IF NOT EXISTS guards).
-- =============================================================================

USE helpdesk_db;
GO

-- =============================================================================
-- 1. TABLE: tickets
-- =============================================================================
IF NOT EXISTS (
    SELECT 1 FROM sys.tables WHERE name = 'tickets' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
    CREATE TABLE dbo.tickets (
        id          INT            IDENTITY(1,1)  NOT NULL,
        userId      NVARCHAR(128)                 NOT NULL,
        issueType   NVARCHAR(32)                  NOT NULL,
        description NVARCHAR(2000)                NOT NULL,
        priority    NVARCHAR(16)                  NOT NULL  DEFAULT 'MEDIUM',
        status      NVARCHAR(16)                  NOT NULL  DEFAULT 'OPEN',
        createdAt   DATETIME2      DEFAULT GETDATE() NOT NULL,
        updatedAt   DATETIME2      DEFAULT GETDATE() NOT NULL,
        resolvedAt  DATETIME2                     NULL,

        CONSTRAINT PK_tickets
            PRIMARY KEY CLUSTERED (id),

        CONSTRAINT CHK_tickets_issueType
            CHECK (issueType IN (
                'PASSWORD_RESET',
                'SOFTWARE_ACCESS',
                'HARDWARE_ISSUE',
                'NETWORK_ISSUE',
                'OTHER'
            )),

        CONSTRAINT CHK_tickets_priority
            CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),

        CONSTRAINT CHK_tickets_status
            CHECK (status IN ('OPEN', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED'))
    );

    PRINT 'Table dbo.tickets created.';
END
ELSE
BEGIN
    PRINT 'Table dbo.tickets already exists — skipped.';
END
GO

-- =============================================================================
-- 2. TRIGGER: trg_tickets_updatedAt
--    Automatically stamps updatedAt = GETDATE() on every UPDATE.
-- =============================================================================
IF EXISTS (
    SELECT 1 FROM sys.triggers WHERE name = 'trg_tickets_updatedAt'
)
    DROP TRIGGER dbo.trg_tickets_updatedAt;
GO

CREATE TRIGGER dbo.trg_tickets_updatedAt
ON dbo.tickets
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    -- Only stamp rows that were actually modified in this batch
    UPDATE t
    SET    t.updatedAt = GETDATE()
    FROM   dbo.tickets AS t
    INNER JOIN inserted AS i ON t.id = i.id;
END;
GO

PRINT 'Trigger dbo.trg_tickets_updatedAt created / replaced.';
GO

-- =============================================================================
-- 3. TABLE: knowledge_base
-- =============================================================================
IF NOT EXISTS (
    SELECT 1 FROM sys.tables WHERE name = 'knowledge_base' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
    CREATE TABLE dbo.knowledge_base (
        id        INT            IDENTITY(1,1)     NOT NULL,
        issueType NVARCHAR(32)                     NOT NULL,
        title     NVARCHAR(256)                    NOT NULL,
        solution  NVARCHAR(MAX)                    NOT NULL,
        keywords  NVARCHAR(512)                    NOT NULL,
        createdAt DATETIME2      DEFAULT GETDATE() NOT NULL,

        CONSTRAINT PK_knowledge_base
            PRIMARY KEY CLUSTERED (id),

        CONSTRAINT CHK_kb_issueType
            CHECK (issueType IN (
                'PASSWORD_RESET',
                'SOFTWARE_ACCESS',
                'HARDWARE_ISSUE',
                'NETWORK_ISSUE',
                'OTHER'
            ))
    );

    PRINT 'Table dbo.knowledge_base created.';
END
ELSE
BEGIN
    PRINT 'Table dbo.knowledge_base already exists — skipped.';
END
GO

-- =============================================================================
-- 4. SEED DATA: knowledge_base (10 realistic IT helpdesk articles)
--    Guard: only insert if the table is empty to avoid duplicates on re-run.
-- =============================================================================
IF NOT EXISTS (SELECT 1 FROM dbo.knowledge_base)
BEGIN
    PRINT 'Seeding dbo.knowledge_base with 10 articles...';

    -- Article 1 — VPN Setup
    INSERT INTO dbo.knowledge_base (issueType, title, solution, keywords)
    VALUES (
        'NETWORK_ISSUE',
        'How to Connect to the Corporate VPN',
        'Step 1: Download and install the GlobalProtect VPN client from the IT portal at https://it.company.com/vpn. '
        + 'Step 2: Open GlobalProtect and enter the gateway address provided in your onboarding email (e.g., vpn.company.com). '
        + 'Step 3: Log in with your corporate username (firstname.lastname) and your Active Directory password. '
        + 'Step 4: If prompted for MFA, approve the push notification in the Microsoft Authenticator app. '
        + 'Step 5: Verify the connection by navigating to an internal site (e.g., http://intranet). '
        + 'If the connection fails, ensure your machine date/time is correct and that UDP port 4501 is not blocked by your local firewall.',
        'vpn,globalprotect,remote access,connect vpn,corporate vpn,tunnel,network,gateway'
    );

    -- Article 2 — Password Reset (Self-Service)
    INSERT INTO dbo.knowledge_base (issueType, title, solution, keywords)
    VALUES (
        'PASSWORD_RESET',
        'How to Reset Your Active Directory Password (Self-Service)',
        'Option A — Self-Service Portal (recommended): '
        + 'Visit https://passwordreset.microsoftonline.com and follow the on-screen prompts. You will need access to your registered MFA method. '
        + 'Option B — Ctrl+Alt+Del: If you are on a domain-joined machine, press Ctrl+Alt+Del → Change a password and enter your old password and new password. '
        + 'Password policy: Minimum 12 characters, at least one uppercase letter, one lowercase letter, one digit, and one special character. '
        + 'Passwords expire every 90 days. '
        + 'If you are locked out and cannot use self-service, contact IT at ext. 1234 or helpdesk@company.com for a manual reset.',
        'password,reset password,forgot password,locked out,account locked,change password,ad password,active directory'
    );

    -- Article 3 — MFA / Authenticator Setup
    INSERT INTO dbo.knowledge_base (issueType, title, solution, keywords)
    VALUES (
        'SOFTWARE_ACCESS',
        'Setting Up Microsoft Authenticator for MFA',
        'Step 1: Install the Microsoft Authenticator app from the App Store (iOS) or Google Play (Android). '
        + 'Step 2: On your computer, go to https://aka.ms/mfasetup and sign in with your corporate account. '
        + 'Step 3: Click "Add method" → select "Authenticator app" → click "Next". '
        + 'Step 4: Open the Authenticator app, tap the + icon, choose "Work or school account", and scan the QR code shown on screen. '
        + 'Step 5: Enter the 6-digit code from the app to verify the setup. '
        + 'Tip: Also add your corporate phone number as a backup MFA method in case you lose your phone.',
        'mfa,multi-factor,authenticator,two factor,2fa,microsoft authenticator,otp,setup mfa'
    );

    -- Article 4 — Software Installation Request
    INSERT INTO dbo.knowledge_base (issueType, title, solution, keywords)
    VALUES (
        'SOFTWARE_ACCESS',
        'Requesting and Installing Approved Software',
        'Step 1: Check the approved software catalogue at https://it.company.com/software — many common tools (Slack, Zoom, VS Code) can be self-installed via the Software Center. '
        + 'Step 2: Open Software Center (search for it in the Start menu), browse the catalogue, and click Install. '
        + 'Step 3: If the software you need is not in the catalogue, submit a Software Access Request ticket including the software name, vendor, business justification, and estimated number of licences needed. '
        + 'Step 4: IT will review the request within 2 business days and contact you with approval or alternatives. '
        + 'Note: Never install unlicensed or personal software on company machines — this violates the Acceptable Use Policy.',
        'software,install,application,licence,software centre,software center,install app,request software'
    );

    -- Article 5 — Printer Not Working
    INSERT INTO dbo.knowledge_base (issueType, title, solution, keywords)
    VALUES (
        'HARDWARE_ISSUE',
        'Troubleshooting: Printer Not Printing or Offline',
        'Quick fixes to try first: '
        + '1. Check that the printer is powered on and shows a Ready/Online light — not flashing or red. '
        + '2. Check paper tray is loaded and there is no paper jam (open all trays and rear doors to inspect). '
        + '3. On your PC go to Settings → Bluetooth & devices → Printers & scanners, find the printer, click "Open print queue", and cancel all stuck jobs. '
        + '4. Right-click the printer → Set as default printer, then try printing a test page. '
        + '5. Restart the Print Spooler service: open Services (services.msc), find "Print Spooler", right-click → Restart. '
        + 'If the printer still shows Offline: delete and re-add the printer using the network share path \\\\printserver\\PrinterName. '
        + 'If issues persist, call IT at ext. 1234.',
        'printer,print,offline,printer offline,paper jam,print queue,spooler,not printing,printer error'
    );

    -- Article 6 — Network / Internet Connectivity
    INSERT INTO dbo.knowledge_base (issueType, title, solution, keywords)
    VALUES (
        'NETWORK_ISSUE',
        'Troubleshooting: No Internet or Network Connectivity',
        'Step 1: Check the network cable — ensure it is firmly plugged into both the laptop/PC and the wall port. For Wi-Fi, confirm you are connected to CORPWIFI (not a personal hotspot). '
        + 'Step 2: Run the Windows Network Troubleshooter: right-click the network icon in the taskbar → Troubleshoot problems. '
        + 'Step 3: Open Command Prompt and run: ping 8.8.8.8. If packets are received, your network is working — the issue is DNS or a specific site. Run: ipconfig /flushdns. '
        + 'Step 4: If ping fails, run: ipconfig /release then ipconfig /renew to get a fresh IP address from DHCP. '
        + 'Step 5: Restart your network adapter: Device Manager → Network Adapters → right-click your adapter → Disable, then Enable. '
        + 'If none of these work, contact the Network team via helpdesk@company.com noting your floor, desk number, and switch port label.',
        'internet,network,no internet,wifi,connectivity,ping,ip address,dhcp,dns,connection dropped,offline'
    );

    -- Article 7 — Outlook Email Configuration
    INSERT INTO dbo.knowledge_base (issueType, title, solution, keywords)
    VALUES (
        'SOFTWARE_ACCESS',
        'Configuring Microsoft Outlook for Your Corporate Email',
        'Outlook 365 (recommended): '
        + 'Step 1: Open Outlook. On first launch it will auto-detect your account if you are on a domain-joined machine — enter your full corporate email (firstname.lastname@company.com) and click Connect. '
        + 'Step 2: Authenticate with your AD password and approve the MFA prompt. '
        + 'Step 3: Outlook will sync your mailbox. This may take 10–20 minutes for large mailboxes. '
        + 'Manual IMAP / SMTP settings (for third-party clients): '
        + 'IMAP Host: outlook.office365.com | Port: 993 | SSL: Yes. '
        + 'SMTP Host: smtp.office365.com | Port: 587 | STARTTLS: Yes. '
        + 'Use your full email address as the username and your AD password. '
        + 'Note: IMAP access requires "Modern Authentication" — ensure your account is MFA-enrolled.',
        'email,outlook,configure email,imap,smtp,office365,mail setup,corporate email,exchange'
    );

    -- Article 8 — BitLocker Encryption
    INSERT INTO dbo.knowledge_base (issueType, title, solution, keywords)
    VALUES (
        'HARDWARE_ISSUE',
        'Recovering Access When BitLocker Recovery Key Is Requested',
        'BitLocker shows a recovery key prompt when it detects a hardware or firmware change, or after a failed PIN attempt. '
        + 'Step 1: Note the 8-digit Recovery Key ID shown on screen. '
        + 'Step 2: Retrieve your 48-digit recovery key from one of these sources: '
        + '  A) IT Self-Service Portal: https://it.company.com/bitlocker — log in with another device using your corporate credentials. '
        + '  B) Contact IT Helpdesk (ext. 1234) — provide your employee ID and the Recovery Key ID; we will verify your identity and supply the key. '
        + 'Step 3: Enter the 48-digit recovery key on the BitLocker screen. Press Enter. '
        + 'Step 4: Once logged in, open Control Panel → BitLocker Drive Encryption and click "Suspend protection", then "Resume protection" to reset the TPM seal and prevent future prompts. '
        + 'Never share your recovery key with anyone outside of the IT department.',
        'bitlocker,recovery key,encryption,tpm,drive encrypted,locked drive,bitlocker recovery'
    );

    -- Article 9 — BSOD / Blue Screen of Death Triage
    INSERT INTO dbo.knowledge_base (issueType, title, solution, keywords)
    VALUES (
        'HARDWARE_ISSUE',
        'What to Do When Your Computer Shows a Blue Screen (BSOD)',
        'A Blue Screen of Death (BSOD) indicates a critical system error. Follow these steps: '
        + 'Step 1: Note or photograph the STOP error code shown (e.g., DRIVER_IRQL_NOT_LESS_OR_EQUAL, MEMORY_MANAGEMENT) and the file name listed beneath it. '
        + 'Step 2: After the machine restarts, open Event Viewer (eventvwr.msc) → Windows Logs → System — look for Critical or Error events at the time of the crash. '
        + 'Step 3: Run the Windows Memory Diagnostic tool (mdsched.exe) to check for RAM issues — schedule a scan on next restart. '
        + 'Step 4: Check for driver updates: Device Manager → right-click any device with a yellow exclamation → Update driver. '
        + 'Step 5: Run SFC scan: open Command Prompt as Administrator and type: sfc /scannow '
        + 'Step 6: If BSODs persist or occur multiple times per day, submit a HARDWARE_ISSUE ticket so IT can remotely collect a memory dump and run advanced diagnostics.',
        'bsod,blue screen,crash,stop error,system crash,kernel panic,memory dump,windows error,freeze'
    );

    -- Article 10 — Account Lockout
    INSERT INTO dbo.knowledge_base (issueType, title, solution, keywords)
    VALUES (
        'PASSWORD_RESET',
        'Account Locked Out — How to Unlock Your Corporate Account',
        'Your account locks automatically after 5 consecutive failed login attempts (AD policy). '
        + 'Self-unlock options: '
        + 'Option A — Self-Service Portal: Visit https://passwordreset.microsoftonline.com, verify your identity via MFA, and choose "Unlock my account" (no password change needed). '
        + 'Option B — Manager: Your direct manager can submit an unlock request through the IT portal on your behalf. '
        + 'Option C — IT Helpdesk: Call ext. 1234 or email helpdesk@company.com. Provide your employee ID for identity verification. Response time: within 15 minutes during business hours. '
        + 'Preventive tips: '
        + '• Ensure saved passwords are updated in any mobile devices, Outlook profiles, or scheduled tasks that may be sending stale credentials. '
        + '• Check for mapped network drives that authenticate in the background — update credentials in Credential Manager.',
        'locked,account locked,lockout,too many attempts,login failed,unlock account,ad lockout,locked out'
    );

    PRINT '10 knowledge base articles inserted successfully.';
END
ELSE
BEGIN
    PRINT 'dbo.knowledge_base already has data — seed skipped.';
END
GO

-- =============================================================================
-- 5. INDEXES for query performance
-- =============================================================================

-- Index on tickets.status for dashboard filter queries
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_tickets_status' AND object_id = OBJECT_ID('dbo.tickets')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_tickets_status
    ON dbo.tickets (status)
    INCLUDE (userId, issueType, priority, createdAt);
    PRINT 'Index IX_tickets_status created.';
END
GO

-- Index on tickets.userId for per-user lookups from the bot
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_tickets_userId' AND object_id = OBJECT_ID('dbo.tickets')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_tickets_userId
    ON dbo.tickets (userId)
    INCLUDE (status, issueType, createdAt);
    PRINT 'Index IX_tickets_userId created.';
END
GO

-- Index on knowledge_base.issueType for filtered KB searches
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_kb_issueType' AND object_id = OBJECT_ID('dbo.knowledge_base')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_kb_issueType
    ON dbo.knowledge_base (issueType);
    PRINT 'Index IX_kb_issueType created.';
END
GO

PRINT '=== Schema setup complete ===';
GO
