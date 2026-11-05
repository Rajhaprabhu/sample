using System.Threading.RateLimiting;
using ApPortal.Api.Auth;
using ApPortal.Api.Frontend;
using ApPortal.Api.Infrastructure;
using ApPortal.Api.Invoices;
using ApPortal.Api.Reference;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddApPortalDatabase();
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<DatabaseExceptionHandler>();

builder.Services.Configure<AuthOptions>(builder.Configuration.GetSection(AuthOptions.Section));
builder.Services.AddAuthentication(SessionAuthenticationHandler.SchemeName)
    .AddScheme<Microsoft.AspNetCore.Authentication.AuthenticationSchemeOptions, SessionAuthenticationHandler>(
        SessionAuthenticationHandler.SchemeName, null);
builder.Services.AddAuthorizationBuilder()
    .AddPolicy(InvoiceEndpoints.DataEntryPolicy, policy => policy.RequireRole("ap_processor", "admin"));
builder.Services.AddSingleton<IPasswordHasher<AppUser>, PasswordHasher<AppUser>>();
builder.Services.AddSingleton<IEmailSender, LoggingEmailSender>();
builder.Services.AddHostedService<DemoPasswordSeeder>();
builder.Services.AddScoped<InvoiceRepository>();

// Slows down password guessing: a few sign-in and reset attempts per minute per address.
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy(AuthEndpoints.RateLimitPolicy, context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = context.RequestServices.GetRequiredService<Microsoft.Extensions.Options.IOptions<AuthOptions>>().Value.AuthRequestsPerMinute,
            Window = TimeSpan.FromMinutes(1),
        }));
});

// Behind a load balancer or container platform, trust its scheme and client address.
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
});

var app = builder.Build();

app.UseForwardedHeaders();
app.UseExceptionHandler();
app.UseStatusCodePages();
if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
}
if (app.Configuration.GetValue<bool>("Hosting:UseHttpsRedirection"))
{
    app.UseHttpsRedirection();
}
app.UseSecurityHeaders();
app.UseFrontend();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

var api = app.MapGroup("/api");
api.MapGet("/health", () => Results.Ok(new { status = "ok" }));
api.MapAuthEndpoints();
api.MapInvoiceEndpoints();
api.MapReferenceEndpoints();

app.Run();

// Lets the integration tests start the app with WebApplicationFactory<Program>.
public partial class Program;
