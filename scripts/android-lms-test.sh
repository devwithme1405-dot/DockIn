#!/usr/bin/env bash
# Lms.resolveAssign run for real on the JVM against a pretend Moodle: the hand-in
# must reach the right assignment whatever id the task carries, and never one the
# LMS does not know. Working JSON classes (scripts/android-tests/org/json) replace
# the stub ones.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT
javac -nowarn -d "$out" \
  "$here/android-tests/org/json/JSONObject.java" "$here/android-tests/org/json/JSONArray.java" \
  $(find "$here/android-stubs" -name '*.java' | grep -v 'org/json/JSONObject.java\|org/json/JSONArray.java') \
  $(find "$here/../android/app/src/main/java" -name '*.java') \
  "$here/android-tests/com/dockin/student/LmsResolveTest.java" 2>&1 | grep -v 'deprecated API\|Recompile with\|Picked up' || true
java -cp "$out" com.dockin.student.LmsResolveTest 2>&1 | grep -v 'Picked up'
