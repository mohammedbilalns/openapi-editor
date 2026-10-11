#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

BINARY_PATH="${1:-${REPO_ROOT}/src-tauri/target/release/openapi-editor}"
OUTPUT_DIR="${2:-${REPO_ROOT}/dist/arch}"

if [[ "${BINARY_PATH}" != /* ]]; then
  BINARY_PATH="$(pwd)/${BINARY_PATH}"
fi

if [[ "${OUTPUT_DIR}" != /* ]]; then
  OUTPUT_DIR="$(pwd)/${OUTPUT_DIR}"
fi

if [ ! -f "${BINARY_PATH}" ]; then
  echo "Error: Binary not found at ${BINARY_PATH}" >&2
  exit 1
fi

mkdir -p "${OUTPUT_DIR}"

BUILD_WORK_DIR="$(mktemp -d)"
trap 'rm -rf "${BUILD_WORK_DIR}"' EXIT

echo "Preparing Arch package staging at ${BUILD_WORK_DIR}..."
cp "${SCRIPT_DIR}/PKGBUILD" "${BUILD_WORK_DIR}/PKGBUILD"
cp "${REPO_ROOT}/packaging/linux/openapi-editor.desktop" "${BUILD_WORK_DIR}/openapi-editor.desktop"
cp "${REPO_ROOT}/src-tauri/icons/32x32.png" "${BUILD_WORK_DIR}/icon_32x32.png"
cp "${REPO_ROOT}/src-tauri/icons/128x128.png" "${BUILD_WORK_DIR}/icon_128x128.png"
cp "${REPO_ROOT}/src-tauri/icons/icon.png" "${BUILD_WORK_DIR}/icon.png"
cp "${BINARY_PATH}" "${BUILD_WORK_DIR}/openapi-editor"
chmod +x "${BUILD_WORK_DIR}/openapi-editor"

echo "Building Arch package with makepkg..."
cd "${BUILD_WORK_DIR}"
makepkg -f --nodeps

echo "Moving generated package to ${OUTPUT_DIR}..."
cp *.pkg.tar.zst "${OUTPUT_DIR}/"
cp PKGBUILD "${OUTPUT_DIR}/"

echo "Arch package successfully built in ${OUTPUT_DIR}:"
ls -lh "${OUTPUT_DIR}"
