using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;

namespace ApPortal.Api.Tests;

[Collection(ApiCollection.Name)]
public sealed class FrontendTests(ApiFactory factory)
{
    private HttpClient Client() => factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

    [Fact]
    public async Task Root_opens_the_sign_in_page()
    {
        var response = await Client().GetAsync("/");
        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.EndsWith("/login/index.html", response.Headers.Location!.ToString());
        Assert.Contains("<form id=\"login-form\"", await Client().GetStringAsync("/login/index.html"));
    }

    [Fact]
    public async Task Config_tells_the_pages_to_use_the_api()
    {
        var config = await Client().GetStringAsync("/shared/config.js");
        Assert.Contains("api: true", config);
    }

    [Theory]
    [InlineData("/db/schema.sql")]
    [InlineData("/backend/src/ApPortal.Api/appsettings.json")]
    [InlineData("/.git/config")]
    public async Task Only_the_app_folders_are_served(string path)
    {
        Assert.Equal(HttpStatusCode.NotFound, (await Client().GetAsync(path)).StatusCode);
    }

    [Fact]
    public async Task Responses_carry_security_headers()
    {
        var response = await Client().GetAsync("/login/index.html");
        Assert.Contains("frame-ancestors 'none'", response.Headers.GetValues("Content-Security-Policy").Single());
        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("DENY", response.Headers.GetValues("X-Frame-Options").Single());
    }
}
