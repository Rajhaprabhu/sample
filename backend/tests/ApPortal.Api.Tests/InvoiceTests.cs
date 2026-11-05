using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace ApPortal.Api.Tests;

[Collection(ApiCollection.Name)]
public sealed class InvoiceTests(ApiFactory factory)
{
    [Fact]
    public async Task Invoices_come_back_with_their_full_details()
    {
        var client = await factory.SignInAsync("anita.rao@company.example");
        var invoices = await client.GetFromJsonAsync<JsonElement>("/api/invoices");
        Assert.Equal(7, invoices.GetArrayLength());

        var paid = invoices.EnumerateArray().Single(i => i.GetProperty("docNumber").GetString() == "INV-10390");
        Assert.Equal("paid", paid.GetProperty("status").GetString());
        Assert.Equal(2, paid.GetProperty("lines").GetArrayLength());
        Assert.Equal(134.20m, paid.GetProperty("payments")[0].GetProperty("discountTaken").GetDecimal());
        Assert.Equal("Daniel Ortiz", paid.GetProperty("approvals")[1].GetProperty("decidedByName").GetString());
        Assert.True(paid.GetProperty("events").GetArrayLength() >= 5);

        var reference = await client.GetFromJsonAsync<JsonElement>("/api/reference");
        Assert.Contains("6100", reference.GetProperty("glAccounts").EnumerateArray().Select(g => g.GetProperty("code").GetString()));
    }

    [Fact]
    public async Task Data_entry_save_submit_and_two_step_approval()
    {
        const string doc = "INV-10422";
        var jane = await factory.SignInAsync("jane.doe@company.example");
        var invoice = await jane.GetFromJsonAsync<JsonElement>($"/api/invoices/{doc}");
        Assert.Equal("received", invoice.GetProperty("status").GetString());
        var rowVersion = invoice.GetProperty("rowVersion").GetInt32();

        object Body(int version, string gl = "5300") => new
        {
            vendorCode = "V-1002", supplierInvoiceNumber = "BLP-88213", invoiceDate = invoice.GetProperty("invoiceDate").GetString(),
            termsCode = "2_10_NET30", poNumber = "PO-4827", currency = "USD", tax = 661.48m, shipping = 0m, total = 8930.00m,
            notes = "Checked against the PDF.", rowVersion = version,
            lines = new[]
            {
                new { description = "Full truckload, Chicago to Dallas", quantity = 1m, unitPrice = 2850.00m, glCode = gl, costCenterCode = "CC-310" },
                new { description = "Pallet handling fee", quantity = 4m, unitPrice = 1354.63m, glCode = gl, costCenterCode = "CC-310" },
            },
        };

        // An out-of-date copy is refused, so one person can't silently overwrite another's changes.
        var stale = await jane.PutAsJsonAsync($"/api/invoices/{doc}", Body(rowVersion - 1));
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);

        var saved = await jane.PutAsJsonAsync($"/api/invoices/{doc}", Body(rowVersion));
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        var afterSave = await saved.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("BLP-88213", afterSave.GetProperty("supplierInvoiceNumber").GetString());
        Assert.Equal(8268.52m, afterSave.GetProperty("subtotal").GetDecimal());
        Assert.Equal(rowVersion + 1, afterSave.GetProperty("rowVersion").GetInt32());

        // Someone without the AP processor role can't edit or submit.
        var tom = await factory.SignInAsync("tom.becker@company.example");
        Assert.Equal(HttpStatusCode.Forbidden, (await tom.PostAsync($"/api/invoices/{doc}/submit", null)).StatusCode);

        var submitted = await jane.PostAsync($"/api/invoices/{doc}/submit", null);
        Assert.Equal(HttpStatusCode.OK, submitted.StatusCode);
        var pending = await submitted.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("pending_approval", pending.GetProperty("status").GetString());
        Assert.Equal("Priya Nair", pending.GetProperty("approvals")[0].GetProperty("assigneeName").GetString());

        // Separation of duties: the submitter can't approve.
        var own = await jane.PostAsJsonAsync($"/api/invoices/{doc}/approve", new { comment = "Looks fine to me, approving." });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, own.StatusCode);
        Assert.Contains("someone else must approve it", await own.Content.ReadAsStringAsync());

        var priya = await factory.SignInAsync("priya.nair@company.example");
        var shortComment = await priya.PostAsJsonAsync($"/api/invoices/{doc}/approve", new { comment = "ok" });
        Assert.Equal(HttpStatusCode.BadRequest, shortComment.StatusCode);

        var first = await (await priya.PostAsJsonAsync($"/api/invoices/{doc}/approve", new { comment = "Delivery confirmed by the warehouse." }))
            .Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("pending_approval", first.GetProperty("status").GetString());

        // The finance controller step needs that role.
        var wrongRole = await priya.PostAsJsonAsync($"/api/invoices/{doc}/approve", new { comment = "Approving the next step too." });
        Assert.Equal(HttpStatusCode.Forbidden, wrongRole.StatusCode);

        var daniel = await factory.SignInAsync("daniel.ortiz@company.example");
        var final = await (await daniel.PostAsJsonAsync($"/api/invoices/{doc}/approve", new { comment = "Within the freight budget." }))
            .Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("approved", final.GetProperty("status").GetString());
        Assert.NotEqual(JsonValueKind.Null, final.GetProperty("approvedAt").ValueKind);

        // Once submitted, the invoice can no longer be edited.
        var lateEdit = await jane.PutAsJsonAsync($"/api/invoices/{doc}", Body(final.GetProperty("rowVersion").GetInt32()));
        Assert.Equal(HttpStatusCode.Conflict, lateEdit.StatusCode);
    }

    [Fact]
    public async Task Save_draft_reports_problems_field_by_field()
    {
        var jane = await factory.SignInAsync("jane.doe@company.example");
        var response = await jane.PutAsJsonAsync("/api/invoices/INV-10388", new
        {
            vendorCode = "", supplierInvoiceNumber = "!", termsCode = "NET30", currency = "USD", tax = -1m, total = 0m, rowVersion = 1,
            lines = Array.Empty<object>(),
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var errors = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("errors");
        foreach (var field in new[] { "vendorCode", "supplierInvoiceNumber", "invoiceDate", "tax", "total", "lines" })
        {
            Assert.True(errors.TryGetProperty(field, out _), $"expected an error for {field}");
        }
    }
}
