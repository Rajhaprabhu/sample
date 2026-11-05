using Dapper;
using Npgsql;

namespace ApPortal.Api.Infrastructure;

public static class Database
{
    // Registers one pooled NpgsqlDataSource for the app. The connection string
    // should set "Search Path=ap" so queries find the AP Portal tables.
    public static IServiceCollection AddApPortalDatabase(this IServiceCollection services)
    {
        // Columns are snake_case (due_date); C# properties are PascalCase (DueDate).
        DefaultTypeMap.MatchNamesWithUnderscores = true;
        SqlMapper.AddTypeHandler(new DateOnlyHandler());

        // Read the setting when the data source is first needed, so every
        // configuration source (including test overrides) has been applied.
        services.AddSingleton(sp =>
        {
            var connectionString = sp.GetRequiredService<IConfiguration>().GetConnectionString("ApPortal");
            if (string.IsNullOrWhiteSpace(connectionString))
            {
                throw new InvalidOperationException(
                    "Set the ConnectionStrings:ApPortal setting (or the ConnectionStrings__ApPortal environment variable).");
            }
            return new NpgsqlDataSourceBuilder(connectionString).Build();
        });
        return services;
    }

    // Npgsql reads and writes PostgreSQL "date" as DateOnly; Dapper needs to be
    // told it may pass DateOnly through as a parameter.
    private sealed class DateOnlyHandler : SqlMapper.TypeHandler<DateOnly>
    {
        public override void SetValue(System.Data.IDbDataParameter parameter, DateOnly value)
        {
            parameter.DbType = System.Data.DbType.Date;
            parameter.Value = value;
        }

        public override DateOnly Parse(object value) => value switch
        {
            DateOnly d => d,
            DateTime dt => DateOnly.FromDateTime(dt),
            _ => DateOnly.Parse(value.ToString()!, System.Globalization.CultureInfo.InvariantCulture),
        };
    }
}
