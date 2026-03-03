from collections.abc import Mapping

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import (
    OTLPSpanExporter as OTLPGrpcSpanExporter,
)
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource, SERVICE_NAME
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

from app.config import settings


def _parse_resource_attributes(raw_attributes: str) -> dict[str, str]:
    attributes: dict[str, str] = {}
    for pair in raw_attributes.split(","):
        if "=" not in pair:
            continue
        key, value = pair.split("=", 1)
        normalized_key = key.strip()
        normalized_value = value.strip()
        if normalized_key and normalized_value:
            attributes[normalized_key] = normalized_value
    return attributes


def _build_resource() -> Resource:
    configured_attributes = _parse_resource_attributes(
        settings.otel_resource_attributes
    )
    resource_attributes: Mapping[str, str] = {
        SERVICE_NAME: settings.otel_service_name,
        **configured_attributes,
    }
    return Resource.create(dict(resource_attributes))


def _resolve_otlp_http_traces_endpoint() -> str:
    endpoint = settings.otel_exporter_otlp_endpoint.rstrip("/")
    if endpoint.endswith("/v1/traces"):
        return endpoint
    return f"{endpoint}/v1/traces"


def _resolve_otlp_grpc_endpoint() -> tuple[str, bool]:
    endpoint = settings.otel_exporter_otlp_endpoint.strip()
    if endpoint.startswith("http://"):
        return endpoint.removeprefix("http://"), True
    if endpoint.startswith("https://"):
        return endpoint.removeprefix("https://"), False
    return endpoint, True


def configure_tracing() -> TracerProvider | None:
    if not settings.otel_enabled:
        return None

    tracer_provider = TracerProvider(resource=_build_resource())
    trace.set_tracer_provider(tracer_provider)

    if settings.otel_exporter_otlp_protocol == "http/protobuf":
        exporter = OTLPSpanExporter(endpoint=_resolve_otlp_http_traces_endpoint())
    elif settings.otel_exporter_otlp_protocol == "grpc":
        endpoint, insecure = _resolve_otlp_grpc_endpoint()
        exporter = OTLPGrpcSpanExporter(endpoint=endpoint, insecure=insecure)
    else:
        raise ValueError(
            "Unsupported OTEL_EXPORTER_OTLP_PROTOCOL value. Use 'http/protobuf' or 'grpc'."
        )

    span_processor = BatchSpanProcessor(exporter)
    tracer_provider.add_span_processor(span_processor)

    return tracer_provider
