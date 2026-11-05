namespace ApPortal.Api.Invoices;

// What the API returns for an invoice: everything the dashboard, the details
// panel and the data entry page show. Status values are the database's
// (received, pending_approval, approved, scheduled, on_hold, paid, rejected).

public sealed record InvoiceDetail(
    string DocNumber,
    string SupplierInvoiceNumber,
    string Status,
    VendorSummary Vendor,
    DateOnly InvoiceDate,
    DateOnly DueDate,
    DateTime ReceivedAt,
    string IntakeChannel,
    string TermsCode,
    string TermsLabel,
    decimal DiscountPercent,
    int? DiscountDays,
    string? PoNumber,
    string Currency,
    decimal Subtotal,
    decimal Tax,
    decimal Shipping,
    decimal Total,
    string? Notes,
    DateTime? SubmittedAt,
    string? SubmittedByName,
    DateTime? ApprovedAt,
    int RowVersion,
    IReadOnlyList<InvoiceLine> Lines,
    MatchResult? Match,
    IReadOnlyList<ApprovalStep> Approvals,
    IReadOnlyList<Hold> Holds,
    Rejection? Rejection,
    IReadOnlyList<PaymentInfo> Payments,
    IReadOnlyList<DocumentInfo> Documents,
    IReadOnlyList<InvoiceEvent> Events);

public sealed record VendorSummary(
    string Code, string Name, string? Category, string Status, string MatchingType, string PaymentMethod,
    string? BillingEmail, string? BankLast4, string? TaxIdLast4, string TermsLabel,
    string? DefaultGlCode, string? DefaultGlName, string? DefaultCostCenterCode, string? DefaultCostCenterName);

public sealed record InvoiceLine(
    int LineNo, string Description, decimal Quantity, decimal UnitPrice, decimal Amount,
    string? GlCode, string? GlName, string? CostCenterCode, string? CostCenterName);

public sealed record MatchResult(string MatchingType, string Po, string Receipt, string Invoice, decimal? VarianceAmount);

public sealed record ApprovalStep(
    int StepNo, string RoleCode, string RoleName, string Status, string? AssigneeName,
    DateTime? WaitingSince, string? DecidedByName, DateTime? DecidedAt, string? Comment);

public sealed record Hold(
    string Type, string Detail, string? NextStep, string? OwnerName, string? OwnerRole, DateTime PlacedAt, DateTime? ReleasedAt);

public sealed record Rejection(string Reason, string? Detail, string ByName, string? ByRole, DateTime At, DateTime? VendorNotifiedAt);

public sealed record PaymentInfo(
    string Ref, string Method, string Status, decimal Amount, DateOnly ScheduledDate, DateTime? PaidAt,
    string? BankReference, string FromAccount, string FromLast4, string? ToLast4,
    string? RemittanceEmail, DateTime? RemittanceSentAt, decimal AmountApplied, decimal DiscountTaken);

public sealed record DocumentInfo(string FileName, string ContentType, long SizeBytes);

public sealed record InvoiceEvent(DateTime At, string Type, string? ActorName, string Message);

// Body of PUT /api/invoices/{docNumber} ("Save draft" on the data entry page).
public sealed record SaveInvoiceRequest(
    string? VendorCode,
    string? SupplierInvoiceNumber,
    DateOnly? InvoiceDate,
    string? TermsCode,
    string? PoNumber,
    string? Currency,
    decimal? Tax,
    decimal? Shipping,
    decimal? Total,
    string? Notes,
    IReadOnlyList<SaveInvoiceLine>? Lines,
    int RowVersion);

public sealed record SaveInvoiceLine(string? Description, decimal Quantity, decimal UnitPrice, string? GlCode, string? CostCenterCode);

public sealed record ApproveRequest(string? Comment);
