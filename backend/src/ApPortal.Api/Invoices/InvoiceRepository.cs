using System.Text.RegularExpressions;
using Dapper;
using Npgsql;

namespace ApPortal.Api.Invoices;

public sealed partial class InvoiceRepository(NpgsqlDataSource db)
{
    // ---------- reading ----------

    // Loads complete invoices: one query per kind of child row, not one per invoice.
    public async Task<List<InvoiceDetail>> GetDetailsAsync(string? docNumber = null)
    {
        await using var conn = await db.OpenConnectionAsync();
        var headers = (await conn.QueryAsync<HeaderRow>(HeaderSql, new { doc = docNumber })).ToList();
        if (headers.Count == 0)
        {
            return [];
        }

        var ids = headers.Select(h => h.Id).ToArray();
        var lines = (await conn.QueryAsync<LineRow>(LinesSql, new { ids })).ToLookup(r => r.InvoiceId);
        var matches = (await conn.QueryAsync<MatchRow>(MatchSql, new { ids })).ToDictionary(r => r.InvoiceId);
        var steps = (await conn.QueryAsync<StepRow>(StepsSql, new { ids })).ToLookup(r => r.InvoiceId);
        var holds = (await conn.QueryAsync<HoldRow>(HoldsSql, new { ids })).ToLookup(r => r.InvoiceId);
        var rejections = (await conn.QueryAsync<RejectionRow>(RejectionsSql, new { ids })).ToLookup(r => r.InvoiceId);
        var payments = (await conn.QueryAsync<PaymentRow>(PaymentsSql, new { ids })).ToLookup(r => r.InvoiceId);
        var documents = (await conn.QueryAsync<DocumentRow>(DocumentsSql, new { ids })).ToLookup(r => r.InvoiceId);
        var events = (await conn.QueryAsync<EventRow>(EventsSql, new { ids })).ToLookup(r => r.InvoiceId);

        return headers.Select(h => new InvoiceDetail(
            h.DocNumber, h.SupplierInvoiceNumber, h.Status,
            new VendorSummary(h.VendorCode, h.VendorName, h.VendorCategory, h.VendorStatus, h.VendorMatchingType,
                h.VendorPaymentMethod, h.VendorBillingEmail, h.VendorBankLast4, h.VendorTaxIdLast4, h.VendorTermsLabel,
                h.VendorGlCode, h.VendorGlName, h.VendorCostCenterCode, h.VendorCostCenterName),
            h.InvoiceDate, h.DueDate, h.ReceivedAt, h.IntakeChannel,
            h.TermsCode, h.TermsLabel, h.DiscountPercent, h.DiscountDays, h.PoNumber, h.Currency,
            h.Subtotal, h.Tax, h.Shipping, h.Total, h.Notes, h.SubmittedAt, h.SubmittedByName, h.ApprovedAt, h.RowVersion,
            lines[h.Id].Select(l => new InvoiceLine(l.LineNo, l.Description, l.Quantity, l.UnitPrice, l.Amount,
                l.GlCode, l.GlName, l.CostCenterCode, l.CostCenterName)).ToList(),
            matches.TryGetValue(h.Id, out var m) ? new MatchResult(m.MatchingType, m.PoResult, m.ReceiptResult, m.InvoiceResult, m.VarianceAmount) : null,
            steps[h.Id].Select(s => new ApprovalStep(s.StepNo, s.RoleCode, s.RoleName, s.Status, s.AssigneeName,
                s.WaitingSince, s.DecidedByName, s.DecidedAt, s.Comment)).ToList(),
            holds[h.Id].Select(x => new Hold(x.HoldType, x.Detail, x.NextStep, x.OwnerName, x.OwnerRole, x.PlacedAt, x.ReleasedAt)).ToList(),
            rejections[h.Id].Select(r => new Rejection(r.Reason, r.Detail, r.ByName, r.ByRole, r.RejectedAt, r.VendorNotifiedAt)).FirstOrDefault(),
            payments[h.Id].Select(p => new PaymentInfo(p.PaymentRef, p.Method, p.Status, p.Amount, p.ScheduledDate,
                p.PaidAt, p.BankReference, p.FromAccount, p.FromLast4, p.ToLast4, p.RemittanceEmail, p.RemittanceSentAt,
                p.AmountApplied, p.DiscountTaken)).ToList(),
            documents[h.Id].Select(d => new DocumentInfo(d.FileName, d.ContentType, d.SizeBytes)).ToList(),
            events[h.Id].Select(e => new InvoiceEvent(e.OccurredAt, e.EventType, e.ActorName, e.Message)).ToList()
        )).ToList();
    }

    public async Task<InvoiceDetail?> GetDetailAsync(string docNumber) =>
        (await GetDetailsAsync(docNumber)).SingleOrDefault();

    // ---------- data entry: save draft ----------

    public abstract record SaveOutcome;
    public sealed record Saved : SaveOutcome;
    public sealed record NotFound : SaveOutcome;
    public sealed record Conflict(string Message) : SaveOutcome;
    public sealed record Invalid(Dictionary<string, string[]> Errors) : SaveOutcome;

    [GeneratedRegex(@"^[A-Za-z0-9][A-Za-z0-9\-/.]{1,29}$")]
    private static partial Regex SupplierNumberPattern();

    [GeneratedRegex(@"^PO-\d{4,}$")]
    private static partial Regex PoPattern();

    public async Task<SaveOutcome> SaveDraftAsync(string docNumber, SaveInvoiceRequest req, long userId)
    {
        var errors = new Dictionary<string, string[]>();
        void Error(string field, string message) => errors[field] = [.. errors.GetValueOrDefault(field, []), message];

        if (string.IsNullOrWhiteSpace(req.VendorCode)) Error("vendorCode", "Choose the vendor.");
        if (string.IsNullOrWhiteSpace(req.SupplierInvoiceNumber) || !SupplierNumberPattern().IsMatch(req.SupplierInvoiceNumber.Trim()))
            Error("supplierInvoiceNumber", "Enter the supplier invoice number: letters, numbers, hyphens, slashes or dots (2 to 30 characters).");
        if (req.InvoiceDate is null) Error("invoiceDate", "Enter the invoice date.");
        else if (req.InvoiceDate > DateOnly.FromDateTime(DateTime.Today)) Error("invoiceDate", "The invoice date cannot be in the future.");
        if (string.IsNullOrWhiteSpace(req.TermsCode)) Error("termsCode", "Choose the payment terms.");
        if (string.IsNullOrWhiteSpace(req.Currency)) Error("currency", "Choose the currency.");
        if (!string.IsNullOrWhiteSpace(req.PoNumber) && !PoPattern().IsMatch(req.PoNumber.Trim().ToUpperInvariant()))
            Error("poNumber", "Enter the purchase order as PO- followed by its number, for example PO-4521.");
        if (req.Tax is null or < 0) Error("tax", "Enter the tax amount (0 if there is none).");
        if (req.Shipping is < 0) Error("shipping", "Shipping cannot be negative.");
        if (req.Total is null or <= 0) Error("total", "Enter the total shown on the invoice.");
        if (req.Notes is { Length: > 500 }) Error("notes", "Notes can be up to 500 characters.");
        if (req.Lines is null || req.Lines.Count == 0) Error("lines", "Add at least one line item.");
        for (var i = 0; i < (req.Lines?.Count ?? 0); i++)
        {
            var line = req.Lines![i];
            if (line.Quantity <= 0) Error("lines", $"Line {i + 1}: enter a quantity greater than 0.");
            if (line.UnitPrice < 0) Error("lines", $"Line {i + 1}: the unit price cannot be negative.");
        }
        if (errors.Count > 0)
        {
            return new Invalid(errors);
        }

        await using var conn = await db.OpenConnectionAsync();
        await using var tx = await conn.BeginTransactionAsync();

        var current = await conn.QuerySingleOrDefaultAsync<CurrentRow>(
            "SELECT id, status::text AS status, row_version FROM invoices WHERE doc_number = @docNumber FOR UPDATE",
            new { docNumber }, tx);
        if (current is null) return new NotFound();
        if (current.Status != "received") return new Conflict("Only invoices in Received can be edited.");
        if (current.RowVersion != req.RowVersion)
            return new Conflict("Someone else changed this invoice while you were editing. Reload the page to see their changes.");

        var vendor = await conn.QuerySingleOrDefaultAsync<VendorRef>(
            "SELECT id, status::text AS status FROM vendors WHERE vendor_code = @code", new { code = req.VendorCode!.Trim() }, tx);
        if (vendor is null || vendor.Status != "active")
            return new Invalid(new() { ["vendorCode"] = ["Choose an active vendor from the vendor master."] });

        var netDays = await conn.QuerySingleOrDefaultAsync<int?>(
            "SELECT net_days FROM payment_terms WHERE code = @code", new { code = req.TermsCode }, tx);
        if (netDays is null) return new Invalid(new() { ["termsCode"] = ["Choose payment terms from the list."] });

        long? poId = null;
        if (!string.IsNullOrWhiteSpace(req.PoNumber))
        {
            var po = await conn.QuerySingleOrDefaultAsync<PoRef>(
                "SELECT id, vendor_id FROM purchase_orders WHERE po_number = @po", new { po = req.PoNumber.Trim().ToUpperInvariant() }, tx);
            if (po is null) return new Invalid(new() { ["poNumber"] = [$"There is no purchase order {req.PoNumber.Trim().ToUpperInvariant()}."] });
            if (po.VendorId != vendor.Id) return new Invalid(new() { ["poNumber"] = ["That purchase order belongs to a different vendor."] });
            poId = po.Id;
        }

        await conn.ExecuteAsync("DELETE FROM invoice_lines WHERE invoice_id = @id", new { id = current.Id }, tx);
        var lineNo = 0;
        foreach (var line in req.Lines!)
        {
            await conn.ExecuteAsync("""
                INSERT INTO invoice_lines (invoice_id, line_no, description, quantity, unit_price, gl_code, cost_center_code)
                VALUES (@invoiceId, @lineNo, @description, @quantity, @unitPrice, @glCode, @costCenterCode)
                """, new
            {
                invoiceId = current.Id,
                lineNo = (short)++lineNo,
                description = (line.Description ?? "").Trim(),
                quantity = line.Quantity,
                unitPrice = line.UnitPrice,
                glCode = string.IsNullOrWhiteSpace(line.GlCode) ? null : line.GlCode.Trim(),
                costCenterCode = string.IsNullOrWhiteSpace(line.CostCenterCode) ? null : line.CostCenterCode.Trim(),
            }, tx);
        }

        await conn.ExecuteAsync("""
            UPDATE invoices
               SET vendor_id = @vendorId, supplier_invoice_number = @number, invoice_date = @invoiceDate,
                   due_date = @invoiceDate + @netDays, payment_terms_code = @termsCode, purchase_order_id = @poId,
                   currency_code = @currency, tax_amount = @tax, shipping_amount = @shipping, total_amount = @total,
                   notes = @notes, updated_by = @userId, row_version = row_version + 1,
                   subtotal_amount = (SELECT coalesce(sum(amount), 0) FROM invoice_lines WHERE invoice_id = @id)
             WHERE id = @id
            """, new
        {
            id = current.Id,
            vendorId = vendor.Id,
            number = req.SupplierInvoiceNumber!.Trim(),
            invoiceDate = req.InvoiceDate!.Value,
            netDays = netDays.Value,
            termsCode = req.TermsCode,
            poId,
            currency = req.Currency!.Trim().ToUpperInvariant(),
            tax = req.Tax,
            shipping = req.Shipping ?? 0,
            total = req.Total,
            notes = string.IsNullOrWhiteSpace(req.Notes) ? null : req.Notes.Trim(),
            userId,
        }, tx);

        await conn.ExecuteAsync("""
            INSERT INTO invoice_events (invoice_id, event_type, actor_user_id, message)
            VALUES (@id, 'updated', @userId, 'Details checked and updated in data entry')
            """, new { id = current.Id, userId }, tx);

        await tx.CommitAsync();
        return new Saved();
    }

    // ---------- workflow (rules live in the database functions) ----------

    public async Task<bool> SubmitAsync(string docNumber, long userId) =>
        await RunWorkflowAsync("SELECT submit_invoice(@id, @userId)::text", docNumber, new { userId });

    public async Task<bool> ApproveAsync(string docNumber, long userId, string comment) =>
        await RunWorkflowAsync("SELECT approve_invoice(@id, @userId, @comment)::text", docNumber, new { userId, comment });

    // Returns false if the invoice doesn't exist; rule violations surface as PostgresException.
    private async Task<bool> RunWorkflowAsync(string sql, string docNumber, object args)
    {
        await using var conn = await db.OpenConnectionAsync();
        var id = await conn.QuerySingleOrDefaultAsync<long?>(
            "SELECT id FROM invoices WHERE doc_number = @docNumber", new { docNumber });
        if (id is null) return false;

        var parameters = new DynamicParameters(args);
        parameters.Add("id", id.Value);
        await conn.ExecuteScalarAsync<string>(sql, parameters);
        return true;
    }

    // ---------- SQL ----------

    private const string HeaderSql = """
        SELECT i.id, i.doc_number, i.supplier_invoice_number, i.status::text AS status,
               i.invoice_date, i.due_date, i.received_at, i.intake_channel::text AS intake_channel,
               i.payment_terms_code AS terms_code, t.label AS terms_label, t.discount_percent, t.discount_days,
               po.po_number, i.currency_code AS currency,
               i.subtotal_amount AS subtotal, i.tax_amount AS tax, i.shipping_amount AS shipping, i.total_amount AS total,
               i.notes, i.submitted_at, su.full_name AS submitted_by_name, i.approved_at, i.row_version,
               v.vendor_code, v.name AS vendor_name, v.category AS vendor_category, v.status::text AS vendor_status,
               v.matching_type::text AS vendor_matching_type, v.payment_method::text AS vendor_payment_method,
               v.billing_email AS vendor_billing_email, v.tax_id_last4 AS vendor_tax_id_last4, vt.label AS vendor_terms_label,
               (SELECT b.account_last4 FROM vendor_bank_accounts b
                 WHERE b.vendor_id = v.id AND b.is_primary AND b.retired_at IS NULL) AS vendor_bank_last4,
               v.default_gl_code AS vendor_gl_code, g.name AS vendor_gl_name,
               v.default_cost_center_code AS vendor_cost_center_code, c.name AS vendor_cost_center_name
          FROM invoices i
          JOIN vendors v ON v.id = i.vendor_id
          JOIN payment_terms t ON t.code = i.payment_terms_code
          JOIN payment_terms vt ON vt.code = v.default_terms_code
          LEFT JOIN purchase_orders po ON po.id = i.purchase_order_id
          LEFT JOIN users su ON su.id = i.submitted_by
          LEFT JOIN gl_accounts g ON g.code = v.default_gl_code
          LEFT JOIN cost_centers c ON c.code = v.default_cost_center_code
         WHERE @doc::text IS NULL OR i.doc_number = @doc
         ORDER BY i.due_date, i.doc_number
        """;

    private const string LinesSql = """
        SELECT l.invoice_id, l.line_no, l.description, l.quantity, l.unit_price, l.amount,
               l.gl_code, g.name AS gl_name, l.cost_center_code, c.name AS cost_center_name
          FROM invoice_lines l
          LEFT JOIN gl_accounts g ON g.code = l.gl_code
          LEFT JOIN cost_centers c ON c.code = l.cost_center_code
         WHERE l.invoice_id = ANY(@ids)
         ORDER BY l.invoice_id, l.line_no
        """;

    private const string MatchSql = """
        SELECT invoice_id, matching_type::text AS matching_type, po_result::text AS po_result,
               receipt_result::text AS receipt_result, invoice_result::text AS invoice_result, variance_amount
          FROM invoice_match_results WHERE invoice_id = ANY(@ids)
        """;

    // Who a step is waiting for: the assigned user, else the budget owner of the
    // first line's cost center, else the first active user with the step's role.
    private const string StepsSql = """
        SELECT s.invoice_id, s.step_no, s.role_code, r.name AS role_name, s.status::text AS status,
               s.waiting_since, s.decided_at, s.comment, d.full_name AS decided_by_name,
               coalesce(a.full_name,
                 CASE WHEN s.role_code = 'budget_owner' THEN
                   (SELECT u.full_name FROM invoice_lines l
                      JOIN cost_centers cc ON cc.code = l.cost_center_code
                      JOIN users u ON u.id = cc.owner_user_id
                     WHERE l.invoice_id = s.invoice_id ORDER BY l.line_no LIMIT 1) END,
                 (SELECT u.full_name FROM user_roles ur JOIN users u ON u.id = ur.user_id
                   WHERE ur.role_code = s.role_code AND u.status = 'active' ORDER BY u.id LIMIT 1)) AS assignee_name
          FROM invoice_approval_steps s
          JOIN roles r ON r.code = s.role_code
          LEFT JOIN users d ON d.id = s.decided_by
          LEFT JOIN users a ON a.id = s.assigned_user_id
         WHERE s.invoice_id = ANY(@ids)
         ORDER BY s.invoice_id, s.step_no
        """;

    private const string HoldsSql = """
        SELECT h.invoice_id, h.hold_type::text AS hold_type, h.detail, h.next_step, h.placed_at, h.released_at,
               u.full_name AS owner_name,
               (SELECT r.name FROM user_roles ur JOIN roles r ON r.code = ur.role_code
                 WHERE ur.user_id = u.id ORDER BY r.code LIMIT 1) AS owner_role
          FROM invoice_holds h LEFT JOIN users u ON u.id = h.owner_user_id
         WHERE h.invoice_id = ANY(@ids)
         ORDER BY h.invoice_id, h.placed_at
        """;

    private const string RejectionsSql = """
        SELECT x.invoice_id, x.reason, x.detail, x.rejected_at, x.vendor_notified_at, u.full_name AS by_name,
               (SELECT r.name FROM user_roles ur JOIN roles r ON r.code = ur.role_code
                 WHERE ur.user_id = u.id ORDER BY r.code LIMIT 1) AS by_role
          FROM invoice_rejections x JOIN users u ON u.id = x.rejected_by
         WHERE x.invoice_id = ANY(@ids)
         ORDER BY x.invoice_id, x.rejected_at DESC
        """;

    private const string PaymentsSql = """
        SELECT a.invoice_id, p.payment_ref, p.method::text AS method, p.status::text AS status, p.amount,
               p.scheduled_date, p.paid_at, p.bank_reference, ca.name AS from_account, ca.account_last4 AS from_last4,
               vb.account_last4 AS to_last4, p.remittance_email, p.remittance_sent_at, a.amount_applied, a.discount_taken
          FROM payment_allocations a
          JOIN payments p ON p.id = a.payment_id
          JOIN company_bank_accounts ca ON ca.id = p.from_account_id
          LEFT JOIN vendor_bank_accounts vb ON vb.id = p.to_bank_account_id
         WHERE a.invoice_id = ANY(@ids)
         ORDER BY a.invoice_id, p.scheduled_date
        """;

    private const string DocumentsSql = """
        SELECT invoice_id, file_name, content_type, size_bytes
          FROM invoice_documents WHERE invoice_id = ANY(@ids) ORDER BY invoice_id, uploaded_at
        """;

    private const string EventsSql = """
        SELECT e.invoice_id, e.occurred_at, e.event_type::text AS event_type, e.message, u.full_name AS actor_name
          FROM invoice_events e LEFT JOIN users u ON u.id = e.actor_user_id
         WHERE e.invoice_id = ANY(@ids)
         ORDER BY e.invoice_id, e.occurred_at, e.id
        """;

    // ---------- row types (Dapper maps snake_case columns to these) ----------

    private sealed class HeaderRow
    {
        public long Id { get; set; }
        public string DocNumber { get; set; } = "";
        public string SupplierInvoiceNumber { get; set; } = "";
        public string Status { get; set; } = "";
        public DateOnly InvoiceDate { get; set; }
        public DateOnly DueDate { get; set; }
        public DateTime ReceivedAt { get; set; }
        public string IntakeChannel { get; set; } = "";
        public string TermsCode { get; set; } = "";
        public string TermsLabel { get; set; } = "";
        public decimal DiscountPercent { get; set; }
        public int? DiscountDays { get; set; }
        public string? PoNumber { get; set; }
        public string Currency { get; set; } = "";
        public decimal Subtotal { get; set; }
        public decimal Tax { get; set; }
        public decimal Shipping { get; set; }
        public decimal Total { get; set; }
        public string? Notes { get; set; }
        public DateTime? SubmittedAt { get; set; }
        public string? SubmittedByName { get; set; }
        public DateTime? ApprovedAt { get; set; }
        public int RowVersion { get; set; }
        public string VendorCode { get; set; } = "";
        public string VendorName { get; set; } = "";
        public string? VendorCategory { get; set; }
        public string VendorStatus { get; set; } = "";
        public string VendorMatchingType { get; set; } = "";
        public string VendorPaymentMethod { get; set; } = "";
        public string? VendorBillingEmail { get; set; }
        public string? VendorTaxIdLast4 { get; set; }
        public string VendorTermsLabel { get; set; } = "";
        public string? VendorBankLast4 { get; set; }
        public string? VendorGlCode { get; set; }
        public string? VendorGlName { get; set; }
        public string? VendorCostCenterCode { get; set; }
        public string? VendorCostCenterName { get; set; }
    }

    private sealed class LineRow
    {
        public long InvoiceId { get; set; }
        public int LineNo { get; set; }
        public string Description { get; set; } = "";
        public decimal Quantity { get; set; }
        public decimal UnitPrice { get; set; }
        public decimal Amount { get; set; }
        public string? GlCode { get; set; }
        public string? GlName { get; set; }
        public string? CostCenterCode { get; set; }
        public string? CostCenterName { get; set; }
    }

    private sealed class MatchRow
    {
        public long InvoiceId { get; set; }
        public string MatchingType { get; set; } = "";
        public string PoResult { get; set; } = "";
        public string ReceiptResult { get; set; } = "";
        public string InvoiceResult { get; set; } = "";
        public decimal? VarianceAmount { get; set; }
    }

    private sealed class StepRow
    {
        public long InvoiceId { get; set; }
        public int StepNo { get; set; }
        public string RoleCode { get; set; } = "";
        public string RoleName { get; set; } = "";
        public string Status { get; set; } = "";
        public DateTime? WaitingSince { get; set; }
        public DateTime? DecidedAt { get; set; }
        public string? Comment { get; set; }
        public string? DecidedByName { get; set; }
        public string? AssigneeName { get; set; }
    }

    private sealed class HoldRow
    {
        public long InvoiceId { get; set; }
        public string HoldType { get; set; } = "";
        public string Detail { get; set; } = "";
        public string? NextStep { get; set; }
        public DateTime PlacedAt { get; set; }
        public DateTime? ReleasedAt { get; set; }
        public string? OwnerName { get; set; }
        public string? OwnerRole { get; set; }
    }

    private sealed class RejectionRow
    {
        public long InvoiceId { get; set; }
        public string Reason { get; set; } = "";
        public string? Detail { get; set; }
        public DateTime RejectedAt { get; set; }
        public DateTime? VendorNotifiedAt { get; set; }
        public string ByName { get; set; } = "";
        public string? ByRole { get; set; }
    }

    private sealed class PaymentRow
    {
        public long InvoiceId { get; set; }
        public string PaymentRef { get; set; } = "";
        public string Method { get; set; } = "";
        public string Status { get; set; } = "";
        public decimal Amount { get; set; }
        public DateOnly ScheduledDate { get; set; }
        public DateTime? PaidAt { get; set; }
        public string? BankReference { get; set; }
        public string FromAccount { get; set; } = "";
        public string FromLast4 { get; set; } = "";
        public string? ToLast4 { get; set; }
        public string? RemittanceEmail { get; set; }
        public DateTime? RemittanceSentAt { get; set; }
        public decimal AmountApplied { get; set; }
        public decimal DiscountTaken { get; set; }
    }

    private sealed class DocumentRow
    {
        public long InvoiceId { get; set; }
        public string FileName { get; set; } = "";
        public string ContentType { get; set; } = "";
        public long SizeBytes { get; set; }
    }

    private sealed class EventRow
    {
        public long InvoiceId { get; set; }
        public DateTime OccurredAt { get; set; }
        public string EventType { get; set; } = "";
        public string Message { get; set; } = "";
        public string? ActorName { get; set; }
    }

    private sealed class CurrentRow
    {
        public long Id { get; set; }
        public string Status { get; set; } = "";
        public int RowVersion { get; set; }
    }

    private sealed class VendorRef
    {
        public long Id { get; set; }
        public string Status { get; set; } = "";
    }

    private sealed class PoRef
    {
        public long Id { get; set; }
        public long VendorId { get; set; }
    }
}
