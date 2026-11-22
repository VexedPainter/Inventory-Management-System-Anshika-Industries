"""
make_zip.py – Safe project packaging script.

Usage:
    python make_zip.py

Steps:
  1. Verifies `import app` succeeds (syntax / import check).
  2. Runs the full pytest suite; aborts if any test fails.
  3. Creates shadow_supply_chain_for_claude.zip in the project root,
     excluding .env, *.db, uploads/, __pycache__, .git/, backups, etc.

"""
import os
import sys
import zipfile
import subprocess

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))

IGNORE_DIRS = {
    '.git', '.gemini', '__pycache__', '.pytest_cache', 'node_modules',
    'uploads', 'backup_before_fixpack', 'backup_before_automation',
    'backup_before_extras', 'backup_before_sales', 'backup_before_ai_agent',
    'backup_before_fixpack2', 'backup_mobile_pwa', 'static_backup',
    'static_v2_backup', 'static_v3_backup', '_archive',
}

IGNORE_EXTS = {
    '.pyc', '.db', '.sqlite', '.sqlite3', '.log',
    '.zip', '.db-shm', '.db-wal', '.bak',
}

IGNORE_FILES = {'.env', '.env.example'}

OUTPUT_NAME = 'shadow_supply_chain_for_claude.zip'


# ---------------------------------------------------------------------------
# Step 1 – import check
# ---------------------------------------------------------------------------
def run_import_check():
    print("Step 1: Checking `import app` ...")
    result = subprocess.run(
        [sys.executable, '-c', 'import app; print("import OK")'],
        capture_output=True, text=True, cwd=PROJECT_ROOT,
    )
    if result.returncode != 0:
        print("ABORT: `import app` failed:\n", result.stderr[-2000:])
        sys.exit(1)
    print(" ", result.stdout.strip())


# ---------------------------------------------------------------------------
# Step 2 – pytest
# ---------------------------------------------------------------------------
def run_pytest():
    print("Step 2: Running pytest ...")
    result = subprocess.run(
        [sys.executable, '-m', 'pytest', '-q', '--tb=short'],
        capture_output=True, text=True, cwd=PROJECT_ROOT,
    )
    lines = result.stdout.strip().splitlines()
    # Print last 10 lines (summary)
    for line in lines[-10:]:
        print(" ", line)
    if result.returncode != 0:
        print("ABORT: pytest reported failures.")
        sys.exit(1)
    print("  pytest: all tests passed.")


# ---------------------------------------------------------------------------
# Step 3 – create zip
# ---------------------------------------------------------------------------
def create_zip(out_path: str):
    print(f"Step 3: Creating {out_path} ...")
    count = 0
    with zipfile.ZipFile(out_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(PROJECT_ROOT):
            # Prune ignored directories in-place
            dirs[:] = [
                d for d in dirs
                if d not in IGNORE_DIRS and not d.startswith('backup_')
            ]
            for filename in files:
                ext = os.path.splitext(filename)[1].lower()
                if filename in IGNORE_FILES or ext in IGNORE_EXTS:
                    continue
                abs_path = os.path.join(root, filename)
                rel_path = os.path.relpath(abs_path, PROJECT_ROOT)
                zf.write(abs_path, rel_path)
                count += 1
    size_mb = os.path.getsize(out_path) / (1024 * 1024)
    print(f"  Created {out_path} — {count} files, {size_mb:.2f} MB.")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
if __name__ == '__main__':
    os.chdir(PROJECT_ROOT)
    run_import_check()
    run_pytest()
    out = os.path.join(PROJECT_ROOT, OUTPUT_NAME)
    create_zip(out)
    print("\nDone! Zip is ready:", out)
