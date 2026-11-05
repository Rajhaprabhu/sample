using Microsoft.Extensions.FileProviders;

namespace ApPortal.Api.Frontend;

// Serves the existing HTML/CSS/JS screens from this app. Only the app's own
// folders are exposed: never the repository root (db/, .git, docs).
public static class FrontendHosting
{
    private static readonly string[] Folders = ["login", "dashboard", "info", "shared"];

    public static WebApplication UseFrontend(this WebApplication app)
    {
        var root = FindRoot(app);
        app.Logger.LogInformation("Serving the AP Portal screens from {Root}", root);

        // The pages read this to decide between the API and their built-in sample data.
        app.Use(async (context, next) =>
        {
            if (HttpMethods.IsGet(context.Request.Method) && context.Request.Path.Equals("/shared/config.js", StringComparison.OrdinalIgnoreCase))
            {
                context.Response.ContentType = "text/javascript; charset=utf-8";
                context.Response.Headers.CacheControl = "no-store";
                var apiBase = $"{context.Request.PathBase}/api".Replace("'", "");
                await context.Response.WriteAsync($"window.AP_CONFIG = {{ api: true, apiBase: '{apiBase}' }};\n");
                return;
            }
            await next();
        });

        foreach (var folder in Folders)
        {
            app.UseStaticFiles(new StaticFileOptions
            {
                FileProvider = new PhysicalFileProvider(Path.Combine(root, folder)),
                RequestPath = "/" + folder,
                // Pages and scripts change with each release; let browsers revalidate.
                OnPrepareResponse = ctx => ctx.Context.Response.Headers.CacheControl = "no-cache",
            });
        }

        app.MapGet("/", (HttpContext context) => Results.Redirect($"{context.Request.PathBase}/login/index.html"))
            .ExcludeFromDescription();
        return app;
    }

    // Published builds carry the screens in wwwroot; when running from the
    // repository they are found by walking up from the project folder.
    private static string FindRoot(WebApplication app)
    {
        var configured = app.Configuration["Frontend:Root"];
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return Path.GetFullPath(configured, app.Environment.ContentRootPath);
        }

        if (File.Exists(Path.Combine(app.Environment.WebRootPath ?? "", "login", "index.html")))
        {
            return app.Environment.WebRootPath!;
        }

        for (var dir = new DirectoryInfo(app.Environment.ContentRootPath); dir is not null; dir = dir.Parent)
        {
            if (File.Exists(Path.Combine(dir.FullName, "login", "index.html")) &&
                File.Exists(Path.Combine(dir.FullName, "dashboard", "index.html")))
            {
                return dir.FullName;
            }
        }
        throw new InvalidOperationException("Could not find the AP Portal screens. Set Frontend:Root to the folder that contains login/ and dashboard/.");
    }
}
