#!/usr/bin/env python3
"""
Reads a UTF-8, comma-delimited CSV (with header), increments a counterGenerate 6-character alphabetic IDs for each row in a CSV file.
starting at 1 for each data row, converts the counter into a 6-character
uppercase ID (excluding 'I' and 'O'), overwrites the existing 'CHAR_ID'
column with the generated ID (skipping any IDs containing banned words),
and writes the result to a default output file derived from the input name.
"""

import argparse
import csv
import os
import sys

# 24 allowed characters: A-Z excluding 'I' and 'O'
CHARSET = "MTQHWZKJYVRGASNBPFUCLDEX"
BASE = len(CHARSET)          # 24
ID_LENGTH = 6
MAX_ID = BASE ** ID_LENGTH   # 24^6 = 191,102,976  (>= 150,000,000)

# New: Define banned substrings (common English swear words) to skip in IDs
BANNED_SUBSTRINGS = [
    "FUCK", "SHT", "CUNT", "GAY", "ASS", "ASSHLE", "SLUT", "DAMN", "VULVA", "WANK", "SPUNK", "SMUT", "SEX", "SCAT", "SEMEN", "RAPE", "PANTY", "NSFW", "NGGER", "JUGGS",
    "HELL", "CRAP", "FAG", "PUSSY", "TWAT", "WANKER", "BTCH", "RETARD", "TRANNY", "JESUS", "FELCH", "FAG", "FECAL", "EUNUCH", "CUM", "BUTT", "BUKKAKE", "BREAST", "ANUS", "ANAL"
]
# Note: Some listed words contain 'I' or 'O' (which are not in CHARSET), so they 
# cannot actually appear in any generated ID. They are included for completeness.

def number_to_char_id(n: int) -> str:
    """
    Convert a positive integer (1..24^6) into a 6-character ID using the
    allowed character set.
    """
    if n < 1 or n > MAX_ID:
        raise ValueError(
            f"Counter {n} is out of range for a 6-char ID "
            f"(allowed: 1..{MAX_ID})."
        )
    value = n - 1  # zero-based
    chars = ["A"] * ID_LENGTH
    for i in range(ID_LENGTH - 1, -1, -1):
        value, rem = divmod(value, BASE)
        chars[i] = CHARSET[rem]
    return "".join(chars)

# New: Helper function to check if an ID contains any banned substring
def contains_banned_substring(id_str: str) -> bool:
    """Return True if id_str contains any banned word substring."""
    s = id_str.upper()
    return any(bad in s for bad in BANNED_SUBSTRINGS)

def default_output_path(input_path: str) -> str:
    """Derive a default output path from the input path."""
    root, ext = os.path.splitext(input_path)
    return f"{root}_with_char_id{ext or '.csv'}"

def process_csv(input_path: str, output_path: str, start: int = 1) -> int:
    """
    Populate the existing CHAR_ID column with generated IDs (skipping banned IDs)
    and write the full rows to output_path. Returns the number of data rows written.
    """
    with open(input_path, mode="r", encoding="utf-8", newline="") as fin, \
         open(output_path, mode="w", encoding="utf-8", newline="") as fout:
        reader = csv.DictReader(fin)
        if reader.fieldnames is None:
            raise ValueError("Input CSV has no header row.")
        if "char_id" not in reader.fieldnames:
            raise ValueError("Input CSV does not contain a 'char_id' column.")
        writer = csv.DictWriter(fout, fieldnames=reader.fieldnames)
        writer.writeheader()
        counter = start
        rows_written = 0  # New: track number of rows written
        for row in reader:
            # New: find the next counter that yields a "clean" ID
            char_id = number_to_char_id(counter)
            while contains_banned_substring(char_id):
                counter += 1
                if counter > MAX_ID:
                    raise RuntimeError("Ran out of valid IDs to assign (all were filtered).")
                char_id = number_to_char_id(counter)
            # Use the valid char_id for this row and write it
            row["char_id"] = char_id
            writer.writerow(row)
            rows_written += 1
            counter += 1  # move to the next number for the next row
        return rows_written

def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description="Fill the CHAR_ID column of a CSV with generated 6-char IDs (skipping profane IDs)."
    )
    parser.add_argument("input", help="Path to the input CSV file.")
    parser.add_argument(
        "-o", "--output",
        help="Path to the output CSV file (default: <input>_with_char_id.csv).",
    )
    args = parser.parse_args(argv)
    output_path = args.output or default_output_path(args.input)
    rows = process_csv(args.input, output_path)
    print(f"Wrote {rows} rows to {output_path}")
    return 0

if __name__ == "__main__":
    sys.exit(main())


