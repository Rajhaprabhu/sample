using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc.Testing;

namespace ApPortal.Api.Tests;

[Collection(ApiCollection.Name)]
public sealed class AuthTests(ApiFactory factory)
{
    private HttpClient NewClient() => factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });

    [Fact]
    public async Task Api_requires_sign_in()
    {
        var response = await NewClient().GetAsync("/api/invoices");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Wrong_password_is_refused_with_a_generic_message()
    {
        var response = await NewClient().PostAsJsonAsync("/api/auth/login", new { email = "anita.rao@company.example", password = "wrong-password" });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Contains("Incorrect email or password", await response.Content.ReadAsStringAsync());

        var unknown = await NewClient().PostAsJsonAsync("/api/auth/login", new { email = "nobody@company.example", password = "wrong-password" });
        Assert.Equal(HttpStatusCode.Unauthorized, unknown.StatusCode);
        Assert.Contains("Incorrect email or password", await unknown.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Sign_in_sets_an_http_only_cookie_and_me_returns_the_user()
    {
        var client = NewClient();
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email = "JANE.DOE@company.example", password = ApiFactory.DemoPassword });
        login.EnsureSuccessStatusCode();
        var cookie = Assert.Single(login.Headers.GetValues("Set-Cookie"));
        Assert.Contains("ap_session=", cookie);
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=strict", cookie, StringComparison.OrdinalIgnoreCase);

        var me = await client.GetFromJsonAsync<JsonElement>("/api/auth/me");
        Assert.Equal("Jane Doe", me.GetProperty("name").GetString());
        Assert.Contains("ap_processor", me.GetProperty("roles").EnumerateArray().Select(r => r.GetString()));
    }

    [Fact]
    public async Task Sign_out_ends_the_session_on_the_server()
    {
        var client = await factory.SignInAsync("priya.nair@company.example");
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync("/api/auth/logout", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Five_failed_attempts_lock_the_account()
    {
        var client = NewClient();
        HttpResponseMessage last = null!;
        for (var i = 0; i < 5; i++)
        {
            last = await client.PostAsJsonAsync("/api/auth/login", new { email = "grace.kim@company.example", password = "wrong-password" });
        }
        Assert.Contains("locked", await last.Content.ReadAsStringAsync());

        // Even the right password is refused while locked.
        var locked = await client.PostAsJsonAsync("/api/auth/login", new { email = "grace.kim@company.example", password = ApiFactory.DemoPassword });
        Assert.Equal(HttpStatusCode.Unauthorized, locked.StatusCode);
        Assert.Contains("Too many failed attempts", await locked.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Password_reset_flow_works_once_and_signs_out_other_sessions()
    {
        const string email = "meera.iyer@company.example";
        var otherSession = await factory.SignInAsync(email);
        var client = NewClient();

        // Unknown emails get the same answer, so the page can't be used to find accounts.
        var unknown = await client.PostAsJsonAsync("/api/auth/forgot-password", new { email = "nobody@company.example" });
        Assert.Equal(HttpStatusCode.Accepted, unknown.StatusCode);
        Assert.Equal(JsonValueKind.Null, (await unknown.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("devResetLink").ValueKind);

        var forgot = await client.PostAsJsonAsync("/api/auth/forgot-password", new { email });
        Assert.Equal(HttpStatusCode.Accepted, forgot.StatusCode);
        var link = (await forgot.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("devResetLink").GetString()!;
        var token = Uri.UnescapeDataString(Regex.Match(link, "token=([^&]+)").Groups[1].Value);

        var verify = await client.GetFromJsonAsync<JsonElement>($"/api/auth/reset-password/verify?token={Uri.EscapeDataString(token)}");
        Assert.Equal(email, verify.GetProperty("email").GetString());

        var weak = await client.PostAsJsonAsync("/api/auth/reset-password", new { token, password = "short" });
        Assert.Equal(HttpStatusCode.BadRequest, weak.StatusCode);

        const string newPassword = "Invoices#2026-new";
        var reset = await client.PostAsJsonAsync("/api/auth/reset-password", new { token, password = newPassword });
        Assert.Equal(HttpStatusCode.NoContent, reset.StatusCode);

        Assert.Equal(HttpStatusCode.Unauthorized, (await otherSession.GetAsync("/api/auth/me")).StatusCode);
        var again = await client.PostAsJsonAsync("/api/auth/reset-password", new { token, password = "Another#Password1" });
        Assert.Equal(HttpStatusCode.Gone, again.StatusCode);
        await factory.SignInAsync(email, newPassword);
    }
}
