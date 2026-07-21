FROM golang:1.21-alpine AS builder
WORKDIR /app
ENV GOFLAGS=-mod=mod
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o gateway .

FROM alpine:3.19
RUN apk --no-cache add ca-certificates tzdata
WORKDIR /app
COPY --from=builder /app/gateway .
EXPOSE 8003
HEALTHCHECK --interval=10s --timeout=3s \
  CMD wget -qO- http://localhost:8003/health || exit 1
CMD ["./gateway"]
