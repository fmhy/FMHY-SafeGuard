export function checkFirefoxDeclarations(manifest, metadata) {
  for (const platform of ["gecko", "gecko_android"]) {
    const minimum =
      manifest.browser_specific_settings?.[platform]?.strict_min_version;
    if (typeof minimum !== "string" || !/^\d+(?:\.\d+)*$/.test(minimum)) {
      throw new Error(
        `Firefox manifest must declare ${platform}.strict_min_version so compatibility is checked.`,
      );
    }
  }
  if (manifest.background?.service_worker) {
    throw new Error(
      "Firefox requires background scripts; service workers are not supported on Firefox for Android.",
    );
  }
  const applications = metadata.version?.compatibility;
  if (
    !Array.isArray(applications) ||
    !["firefox", "android"].every((app) => applications.includes(app))
  ) {
    throw new Error(
      "AMO submission metadata must include both firefox and android in version.compatibility.",
    );
  }
}

export function checkFirefoxLintReport(report) {
  if (
    !Array.isArray(report.errors) ||
    !Array.isArray(report.warnings) ||
    !Array.isArray(report.notices) ||
    !Number.isInteger(report.summary?.errors)
  ) {
    throw new Error(
      "Missing or invalid web-ext lint report; Firefox compatibility was not checked.",
    );
  }
  const incompatible = [...report.warnings, ...report.notices].filter(
    ({ code }) =>
      /ANDROID|INCOMPATIBLE_API|UNSUPPORTED_BY_MIN_VERSION/.test(code),
  );
  const failures = [...report.errors, ...incompatible];
  if (report.summary.errors || failures.length) {
    throw new Error(
      "Firefox submission blocked by web-ext:\n" +
        failures
          .map(
            ({ code, message, description, file }) =>
              `${code}: ${message}${file ? ` (${file})` : ""}${description ? `\n${description}` : ""}`,
          )
          .join("\n"),
    );
  }
}
