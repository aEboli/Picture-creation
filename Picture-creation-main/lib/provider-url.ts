const API_VERSION_SEGMENT_PATTERN = /^v\d+(?:alpha|beta)?\d*$/i;

export interface ProviderEndpointInput {
  apiBaseUrl?: string;
  apiVersion?: string;
}

export interface ProviderEndpoint {
  baseUrl?: string;
  apiVersion?: string;
}

function stripTrailingSlashes(value: string) {
  return value.replace(/\/+$/, "");
}

function endsWithApiVersionSegment(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    const segments = parsed.pathname.split("/").filter(Boolean);
    return segments.length > 0 && API_VERSION_SEGMENT_PATTERN.test(segments[segments.length - 1]);
  } catch {
    return false;
  }
}

export function resolveProviderEndpoint(input: ProviderEndpointInput): ProviderEndpoint {
  const baseUrl = stripTrailingSlashes(input.apiBaseUrl?.trim() ?? "");
  const apiVersion = input.apiVersion?.trim() ?? "";

  if (!baseUrl) {
    return {
      apiVersion: apiVersion || undefined,
    };
  }

  if (endsWithApiVersionSegment(baseUrl)) {
    return {
      baseUrl,
      apiVersion: "",
    };
  }

  return {
    baseUrl,
    apiVersion: apiVersion || undefined,
  };
}
