using System.Security.Claims;
using ApPortal.Api.Auth;

namespace ApPortal.Api.Invoices;

public static class InvoiceEndpoints
{
    public const string DataEntryPolicy = "DataEntry";

    public static RouteGroupBuilder MapInvoiceEndpoints(this RouteGroupBuilder api)
    {
        var invoices = api.MapGroup("/invoices").RequireAuthorization();

        // Full records for every invoice (the dashboard loads these once).
        invoices.MapGet("/", async (InvoiceRepository repo) => Results.Ok(await repo.GetDetailsAsync()));

        invoices.MapGet("/{docNumber}", async (string docNumber, InvoiceRepository repo) =>
            await repo.GetDetailAsync(docNumber) is { } detail ? Results.Ok(detail) : NotFound(docNumber));

        // "Save draft" on the data entry page.
        invoices.MapPut("/{docNumber}", async (string docNumber, SaveInvoiceRequest request, ClaimsPrincipal user, InvoiceRepository repo) =>
        {
            var outcome = await repo.SaveDraftAsync(docNumber, request, user.UserId());
            return outcome switch
            {
                InvoiceRepository.Saved => Results.Ok(await repo.GetDetailAsync(docNumber)),
                InvoiceRepository.NotFound => NotFound(docNumber),
                InvoiceRepository.Conflict c => Results.Problem(detail: c.Message, statusCode: StatusCodes.Status409Conflict),
                InvoiceRepository.Invalid v => Results.ValidationProblem(v.Errors,
                    detail: string.Join(" ", v.Errors.Values.SelectMany(m => m))),
                _ => throw new InvalidOperationException("Unknown save outcome."),
            };
        }).RequireAuthorization(DataEntryPolicy);

        // "Submit for approval": submit_invoice() checks the invoice is complete and builds the approval chain.
        invoices.MapPost("/{docNumber}/submit", async (string docNumber, ClaimsPrincipal user, InvoiceRepository repo) =>
            await repo.SubmitAsync(docNumber, user.UserId())
                ? Results.Ok(await repo.GetDetailAsync(docNumber))
                : NotFound(docNumber)).RequireAuthorization(DataEntryPolicy);

        // "Approve" with comments: approve_invoice() checks the role, the comment and separation of duties.
        invoices.MapPost("/{docNumber}/approve", async (string docNumber, ApproveRequest request, ClaimsPrincipal user, InvoiceRepository repo) =>
        {
            var comment = request.Comment?.Trim() ?? "";
            if (comment.Length < 10)
            {
                return Results.ValidationProblem(
                    new Dictionary<string, string[]> { ["comment"] = ["Enter approval comments of at least 10 characters."] },
                    detail: "Enter approval comments of at least 10 characters.");
            }
            return await repo.ApproveAsync(docNumber, user.UserId(), comment)
                ? Results.Ok(await repo.GetDetailAsync(docNumber))
                : NotFound(docNumber);
        });

        return api;
    }

    private static IResult NotFound(string docNumber) =>
        Results.Problem(detail: $"There is no invoice {docNumber}.", statusCode: StatusCodes.Status404NotFound);
}
