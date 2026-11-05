# Builds the AP Portal .NET app with its screens. Build from the repository root:
#   docker build -f backend/Dockerfile -t ap-portal .
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY backend/ backend/
COPY login/ login/
COPY dashboard/ dashboard/
COPY info/ info/
COPY shared/ shared/
RUN dotnet publish backend/src/ApPortal.Api -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
# Run as the image's non-root user.
USER $APP_UID
ENTRYPOINT ["dotnet", "ApPortal.Api.dll"]
