#!/usr/bin/env python3
"""
Dump plan script - flattens a plan subtree into scratch/dumps/<plan-name>/

Usage:
    python scripts/dump-plan.py <plan-name-or-path>

Examples:
    python scripts/dump-plan.py 8-debug-script-bake-in
    python scripts/dump-plan.py ./docs/plans/8-debug-script-bake-in
"""

import os
import sys
import shutil
import shlex
import subprocess
from pathlib import Path
from typing import List, Dict

def find_plan_directory(plan_input: str) -> Path:
    """Find the plan directory based on input (name or full path)."""
    input_path = Path(plan_input)
    
    # If it's already a full path and exists, use it
    if input_path.exists() and input_path.is_dir():
        return input_path.resolve()
    
    # Otherwise, treat it as a plan name relative to docs/plans/
    plan_path = Path("docs/plans") / input_path
    if plan_path.exists() and plan_path.is_dir():
        return plan_path.resolve()
    
    # Try with common variations
    variations = [
        f"{input_path}-debug-script-bake-in",
        f"{input_path}-breakpoint-variable-exploration",
        f"{input_path}-javascript-test-debugging",
    ]
    
    for variation in variations:
        test_path = Path("docs/plans") / variation
        if test_path.exists() and test_path.is_dir():
            return test_path.resolve()
    
    raise FileNotFoundError(f"Plan directory not found: {plan_input}")

def create_output_directory(plan_name: str) -> Path:
    """Create the output directory in scratch/dumps/, clearing any existing files."""
    output_dir = Path("scratch/dumps") / plan_name

    # Remove the directory if it exists, then recreate it
    if output_dir.exists():
        import shutil
        shutil.rmtree(output_dir)
        print(f"🧹 Cleared existing dump directory: {output_dir}")

    # Create fresh directory
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir.resolve()

def get_all_files(plan_dir: Path) -> List[Path]:
    """Get all files in the plan directory tree."""
    files = []
    for item in plan_dir.rglob("*"):
        if item.is_file():
            files.append(item)
    return files

def flatten_filename_with_path(file_path: Path, plan_dir: Path) -> str:
    """Create a flattened filename that includes the relative path as dash-separated components."""
    try:
        # Try to get the relative path from the plan directory
        relative_path = file_path.relative_to(plan_dir)

        # If it's in the root of the plan, just use the filename
        if relative_path.parent == Path('.'):
            return file_path.name

        # Otherwise, create a dash-separated path
        # Convert path components to dash-separated, then append the filename
        path_parts = []
        current = relative_path.parent
        while current != Path('.'):
            path_parts.insert(0, current.name)
            current = current.parent

        # Join path parts with dashes and append filename
        path_prefix = '-'.join(path_parts)
        return f"{path_prefix}-{file_path.name}"

    except ValueError:
        # File is not under plan directory (e.g., root docs), use original filename
        return file_path.name

def handle_filename_conflicts(files: List[Path], plan_dir: Path) -> Dict[Path, str]:
    """Handle filename conflicts by using path-based flattening."""
    name_counts = {}
    result = {}

    for file_path in files:
        # Create flattened name with path information
        flattened_name = flatten_filename_with_path(file_path, plan_dir)

        # Handle any remaining conflicts with numeric suffixes
        if flattened_name not in name_counts:
            name_counts[flattened_name] = 0
            result[file_path] = flattened_name
        else:
            name_counts[flattened_name] += 1
            # Add suffix before extension for rare conflicts
            stem, ext = os.path.splitext(flattened_name)
            new_name = f"{stem}-{name_counts[flattened_name]}{ext}"
            result[file_path] = new_name

    return result

def copy_files_flattened(files: List[Path], output_dir: Path, name_mapping: Dict[Path, str]):
    """Copy files to output directory with flattened structure."""
    for src_file, dest_name in name_mapping.items():
        dest_path = output_dir / dest_name
        shutil.copy2(src_file, dest_path)
        try:
            src_display = src_file.relative_to(Path.cwd())
        except ValueError:
            src_display = str(src_file)
        print(f"Copied: {src_display} -> {dest_path.relative_to(Path.cwd())}")

def run_jk_gcm_command(output_dir: Path):
    """Run the jk-gcm command on the output directory using zsh alias."""
    try:
        result = subprocess.run(
            ["zsh", "-i", "-c", f"jk-gcm {shlex.quote(str(output_dir))}"],
            capture_output=True,
            text=True,
            check=True
        )
        print(f"✅ jk-gcm completed successfully")
        if result.stdout:
            print(f"Output: {result.stdout.strip()}")
    except subprocess.CalledProcessError as e:
        print(f"⚠️  jk-gcm failed: {e}")
        if e.stderr:
            print(f"Error: {e.stderr.strip()}")
    except FileNotFoundError:
        print("⚠️  zsh not found - skipping")

def main():
    if len(sys.argv) != 2:
        print("Usage: python scripts/dump-plan.py <plan-name-or-path>")
        print("Examples:")
        print("  python scripts/dump-plan.py 8-debug-script-bake-in")
        print("  python scripts/dump-plan.py ./docs/plans/8-debug-script-bake-in")
        sys.exit(1)
    
    plan_input = sys.argv[1]
    
    try:
        # Find the plan directory
        plan_dir = find_plan_directory(plan_input)
        print(f"Found plan directory: {plan_dir}")
        
        # Extract plan name from directory path
        plan_name = plan_dir.name
        print(f"Plan name: {plan_name}")
        
        # Create output directory
        output_dir = create_output_directory(plan_name)
        print(f"Output directory: {output_dir}")
        
        # Get all files in the plan subtree
        files = get_all_files(plan_dir)
        print(f"Found {len(files)} files to copy")

        if not files:
            print("⚠️  No files found in plan directory")
            sys.exit(1)

        # Handle filename conflicts
        name_mapping = handle_filename_conflicts(files, plan_dir)

        # Copy files flattened first
        copy_files_flattened(files, output_dir, name_mapping)

        # Then run jk-gcm command on the output directory
        run_jk_gcm_command(output_dir)
        
        print(f"\n✅ Plan dump completed successfully!")
        print(f"📁 Output directory: {output_dir}")
        print(f"📄 Files copied: {len(files)}")
        
    except FileNotFoundError as e:
        print(f"❌ Error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()