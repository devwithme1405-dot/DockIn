#!/usr/bin/env bash
# The APK updater's download, run for real on the JVM against a local HTTP
# server: GitHub-style redirects, a connection dropping halfway (resume), a
# server that ignores resume, a wrong SHA-256 or size (refused, nothing kept).
# Android itself isn't needed for this part; the stubs stand in for it, and a
# working JSONObject (scripts/android-tests/org/json) replaces the stub one.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT
javac -nowarn -d "$out" \
  "$here/android-tests/org/json/JSONObject.java" \
  $(find "$here/android-stubs" -name '*.java' | grep -v 'org/json/JSONObject.java') \
  $(find "$here/../android/app/src/main/java" -name '*.java') \
  "$here/android-tests/com/dockin/student/UpdaterTest.java" 2>&1 | grep -v 'deprecated API\|Recompile with' || true
java -cp "$out" com.dockin.student.UpdaterTest
