using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace ApPortal.Api.Infrastructure;

// Turns rule violations raised by the database (constraints, triggers and the
// workflow functions) into clear 4xx responses instead of server errors.
public sealed class DatabaseExceptionHandler(IProblemDetailsService problemDetails) : IExceptionHandler
{
    private static readonly Dictionary<string, (int Status, string Message)> Constraints = new()
    {
        ["uq_invoices_vendor_supplier_number"] = (StatusCodes.Status409Conflict,
            "This vendor already has an invoice with that number. It may be a duplicate."),
        ["uq_approval_one_decision_per_person"] = (StatusCodes.Status409Conflict,
            "You have already approved a step of this invoice, so the next step needs a different approver."),
        ["ck_invoices_balanced"] = (StatusCodes.Status422UnprocessableEntity,
            "The lines, tax and shipping must add up to the invoice total."),
        ["ck_approval_comment"] = (StatusCodes.Status422UnprocessableEntity,
            "Approval comments are required (at least 10 characters)."),
    };

    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken cancellationToken)
    {
        if (exception is not PostgresException pg)
        {
            return false;
        }

        (int status, string message)? mapped = pg.SqlState switch
        {
            // RAISE EXCEPTION in the workflow functions: the message is written for people.
            PostgresErrorCodes.RaiseException => (StatusCodes.Status422UnprocessableEntity, pg.MessageText),
            PostgresErrorCodes.NoDataFound => (StatusCodes.Status404NotFound, pg.MessageText),
            PostgresErrorCodes.InsufficientPrivilege => (StatusCodes.Status403Forbidden, pg.MessageText),
            PostgresErrorCodes.UniqueViolation or PostgresErrorCodes.CheckViolation
                when pg.ConstraintName is { } name && Constraints.TryGetValue(name, out var known) => known,
            // A trigger raised check_violation with its own message (e.g. separation of duties).
            PostgresErrorCodes.CheckViolation when pg.ConstraintName is null
                => (StatusCodes.Status422UnprocessableEntity, pg.MessageText),
            PostgresErrorCodes.CheckViolation => (StatusCodes.Status422UnprocessableEntity,
                "One of the values is not allowed. Check the highlighted fields and try again."),
            PostgresErrorCodes.ForeignKeyViolation => (StatusCodes.Status422UnprocessableEntity,
                "A code you chose does not exist (vendor, GL account, cost center, currency or terms)."),
            _ => null,
        };
        if (mapped is null)
        {
            return false;
        }

        context.Response.StatusCode = mapped.Value.status;
        return await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = context,
            ProblemDetails = new ProblemDetails { Status = mapped.Value.status, Title = "The request could not be completed", Detail = mapped.Value.message },
            Exception = exception,
        });
    }
}
