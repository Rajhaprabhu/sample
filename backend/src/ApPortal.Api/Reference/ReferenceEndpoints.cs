using Dapper;
using Npgsql;

namespace ApPortal.Api.Reference;

public static class ReferenceEndpoints
{
    public sealed class VendorOption
    {
        public string Code { get; set; } = "";
        public string Name { get; set; } = "";
        public string? Category { get; set; }
        public string Status { get; set; } = "";
        public string MatchingType { get; set; } = "";
        public string PaymentMethod { get; set; } = "";
        public string TermsCode { get; set; } = "";
        public string? GlCode { get; set; }
        public string? CostCenterCode { get; set; }
        public string? BankLast4 { get; set; }
    }

    public sealed class TermsOption
    {
        public string Code { get; set; } = "";
        public string Label { get; set; } = "";
        public int NetDays { get; set; }
        public decimal DiscountPercent { get; set; }
        public int? DiscountDays { get; set; }
    }

    public sealed class CodeOption
    {
        public string Code { get; set; } = "";
        public string Name { get; set; } = "";
    }

    public static RouteGroupBuilder MapReferenceEndpoints(this RouteGroupBuilder api)
    {
        var group = api.MapGroup("").RequireAuthorization();

        // Dropdown choices for the data entry page.
        group.MapGet("/reference", async (NpgsqlDataSource db) =>
        {
            await using var conn = await db.OpenConnectionAsync();
            var vendors = await conn.QueryAsync<VendorOption>("""
                SELECT v.vendor_code AS code, v.name, v.category, v.status::text AS status,
                       v.matching_type::text AS matching_type, v.payment_method::text AS payment_method,
                       v.default_terms_code AS terms_code, v.default_gl_code AS gl_code,
                       v.default_cost_center_code AS cost_center_code,
                       (SELECT b.account_last4 FROM vendor_bank_accounts b
                         WHERE b.vendor_id = v.id AND b.is_primary AND b.retired_at IS NULL) AS bank_last4
                  FROM vendors v ORDER BY v.name
                """);
            var terms = await conn.QueryAsync<TermsOption>(
                "SELECT code, label, net_days, discount_percent, discount_days FROM payment_terms ORDER BY net_days, discount_percent");
            var currencies = await conn.QueryAsync<string>("SELECT code FROM currencies ORDER BY code");
            var glAccounts = await conn.QueryAsync<CodeOption>("SELECT code, name FROM gl_accounts WHERE is_active ORDER BY code");
            var costCenters = await conn.QueryAsync<CodeOption>("SELECT code, name FROM cost_centers WHERE is_active ORDER BY code");
            return Results.Ok(new { vendors, terms, currencies, glAccounts, costCenters });
        });

        // The dashboard's status buckets and aging, straight from the database views.
        group.MapGet("/dashboard", async (NpgsqlDataSource db) =>
        {
            await using var conn = await db.OpenConnectionAsync();
            var statusSummary = await conn.QueryAsync(
                "SELECT status::text AS status, invoice_count, total_amount, overdue_count FROM v_dashboard_status_summary");
            var aging = await conn.QueryAsync("SELECT bucket, invoice_count, total_amount FROM v_dashboard_aging");
            return Results.Ok(new { statusSummary, aging });
        });

        return api;
    }
}
