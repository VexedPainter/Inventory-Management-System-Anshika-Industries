import os
import zipfile

def create_zips():
    ignore_dirs = {
        '.git', '.gemini', '__pycache__', '.pytest_cache',
        'Include', 'Lib', 'Scripts', 'share', 'venv', 'env', 'node_modules',
        'backup_before_fixpack', 'backup_before_automation', 'backup_before_extras',
        'static_backup', 'static_v2_backup', 'static_v3_backup'
    }
    ignore_exts = {'.pyc', '.db', '.sqlite', '.sqlite3', '.log', '.pdf', '.zip', '.db-shm', '.db-wal'}

    claude_zip = "shadow_supply_chain_for_claude.zip"
    anishka_zip = "d:/Projects/Anishka_Inventory_v1.0.zip"

    # 1. Create shadow_supply_chain_for_claude.zip
    print(f"Creating {claude_zip}...")
    count_claude = 0
    with zipfile.ZipFile(claude_zip, 'w', zipfile.ZIP_DEFLATED) as z_claude:
        for root, dirs, files in os.walk('.'):
            dirs[:] = [d for d in dirs if d not in ignore_dirs and not d.startswith('backup_')]
            for file in files:
                ext = os.path.splitext(file)[1].lower()
                if ext in ignore_exts or file.endswith('.zip'):
                    continue
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, '.')
                z_claude.write(file_path, arcname)
                count_claude += 1

    print(f"Created {claude_zip} with {count_claude} files.")

    # 2. Update d:/Projects/Anishka_Inventory_v1.0.zip
    print(f"Updating {anishka_zip}...")
    count_anishka = 0
    with zipfile.ZipFile(anishka_zip, 'w', zipfile.ZIP_DEFLATED) as z_anishka:
        for root, dirs, files in os.walk('.'):
            dirs[:] = [d for d in dirs if d not in ignore_dirs and not d.startswith('backup_')]
            for file in files:
                ext = os.path.splitext(file)[1].lower()
                if ext in ignore_exts or file.endswith('.zip'):
                    continue
                file_path = os.path.join(root, file)
                relname = os.path.relpath(file_path, '.')
                arcname = os.path.join("Anishka_Inventory", relname).replace("\\", "/")
                z_anishka.write(file_path, arcname)
                count_anishka += 1

    print(f"Updated {anishka_zip} with {count_anishka} files.")

if __name__ == "__main__":
    create_zips()
