#!/usr/bin/env bash
set -euo pipefail

local_ip() {
  hostname -I 2>/dev/null | awk '{ for (i = 1; i <= NF; i++) if ($i !~ /^127\./) { print $i; exit } }' || true
  ip -4 route get 1.1.1.1 2>/dev/null | awk '{ for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit } }' || true
  ifconfig 2>/dev/null | awk '/inet / && $2 != "127.0.0.1" { print $2; exit }' || true
}

human_kib() {
  awk -v kib="$1" 'BEGIN {
    value = kib * 1024
    split("B K M G T", unit)
    idx = 1
    while (value >= 1024 && idx < 5) {
      value /= 1024
      idx++
    }
    if (idx == 1) printf "%d%s", value, unit[idx]
    else printf "%.1f%s", value, unit[idx]
  }'
}

format_uptime() {
  local total="$1"
  if [[ ! "$total" =~ ^[0-9]+$ ]]; then
    uptime -p 2>/dev/null | sed 's/^up //' || uptime
    return
  fi

  local days=$((total / 86400))
  local hours=$(((total % 86400) / 3600))
  local minutes=$(((total % 3600) / 60))
  local seconds=$((total % 60))
  local parts=()

  ((days > 0)) && parts+=("${days}d")
  ((hours > 0)) && parts+=("${hours}h")
  ((minutes > 0)) && parts+=("${minutes}m")
  if ((${#parts[@]} == 0)); then
    parts+=("${seconds}s")
  fi

  echo "${parts[*]}"
}

uptime_seconds() {
  if [[ -r /proc/uptime ]]; then
    cut -d' ' -f1 /proc/uptime | cut -d. -f1
    return
  fi

  if command -v who >/dev/null 2>&1 && command -v date >/dev/null 2>&1; then
    local boot_time boot_epoch current_year now
    current_year="$(date +%Y)"
    boot_time="$(who -b | awk -v year="$current_year" '{ print $(NF - 2) " " $(NF - 1) " " $NF " " year }' || true)"
    boot_epoch="$(date -j -f "%b %e %H:%M %Y" "$boot_time" +%s 2>/dev/null || true)"
    now="$(date +%s)"
    if [[ "$boot_epoch" =~ ^[0-9]+$ && "$now" =~ ^[0-9]+$ && "$now" -gt "$boot_epoch" ]]; then
      echo $((now - boot_epoch))
    fi
  fi
}

memory_status() {
  if [[ -r /proc/meminfo ]]; then
    awk '
      /MemTotal:/ { total = $2 }
      /MemAvailable:/ { available = $2 }
      END {
        if (total > 0 && available > 0) {
          used = total - available
          printf "%d %d %.0f", used, total, used * 100 / total
        }
      }
    ' /proc/meminfo
    return
  fi

  if command -v vm_stat >/dev/null 2>&1; then
    vm_stat 2>/dev/null | awk '
      function clean(value) {
        gsub(/[^0-9]/, "", value)
        return value + 0
      }
      /page size of/ {
        for (i = 1; i <= NF; i++) {
          if ($i ~ /^[0-9]+$/) page_size = $i + 0
        }
      }
      /Pages free:/ { free = clean($NF) }
      /Pages active:/ { active = clean($NF) }
      /Pages inactive:/ { inactive = clean($NF) }
      /Pages speculative:/ { speculative = clean($NF) }
      /Pages wired down:/ { wired = clean($NF) }
      /Pages occupied by compressor:/ { compressed = clean($NF) }
      END {
        total_pages = free + active + inactive + speculative + wired + compressed
        available_pages = free + inactive + speculative
        if (page_size > 0 && total_pages > 0) {
          used_pages = total_pages - available_pages
          used_kib = used_pages * page_size / 1024
          total_kib = total_pages * page_size / 1024
          printf "%.0f %.0f %.0f", used_kib, total_kib, used_pages * 100 / total_pages
        }
      }
    '
    return
  fi
}

cpu_snapshot() {
  if [[ -r /proc/stat ]]; then
    awk '/^cpu / {
      idle = $5 + $6
      total = 0
      for (i = 2; i <= NF; i++) total += $i
      print idle, total
      exit
    }' /proc/stat
  fi
}

cpu_used_pct() {
  if [[ -r /proc/stat ]]; then
    local idle_a total_a idle_b total_b
    read -r idle_a total_a <<<"$(cpu_snapshot)"
    sleep 0.2
    read -r idle_b total_b <<<"$(cpu_snapshot)"

    awk -v idle_delta="$((idle_b - idle_a))" -v total_delta="$((total_b - total_a))" 'BEGIN {
      if (total_delta > 0) printf "%.0f", (total_delta - idle_delta) * 100 / total_delta
    }'
    return
  fi

  if command -v top >/dev/null 2>&1; then
    local top_pct
    top_pct="$(top -l 1 -n 0 2>/dev/null | awk '/CPU usage/ {
      user = $3
      sys_pct = $5
      gsub(/%/, "", user)
      gsub(/%/, "", sys_pct)
      printf "%.0f", user + sys_pct
      exit
    }' || true)"
    if [[ -n "$top_pct" ]]; then
      printf "%s" "$top_pct"
      return
    fi
  fi

  if command -v ps >/dev/null 2>&1; then
    local core_count
    core_count="$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 1)"
    ps -A -o %cpu= 2>/dev/null | awk -v cores="$core_count" '{
      total += $1
      count++
    }
    END {
      if (cores > 0 && count > 0) printf "%.0f", total / cores
    }'
  fi
}

cpu_status() {
  local used_pct="$1"
  local load_one="$2"
  local core_count="$3"

  if [[ "$used_pct" =~ ^[0-9]+$ && "$load_one" =~ ^[0-9]+([.][0-9]+)?$ && "$core_count" =~ ^[0-9]+$ && "$core_count" -gt 0 ]]; then
    awk -v used="$used_pct" -v load="$load_one" -v cores="$core_count" 'BEGIN {
      printf "%d%% used, %.0f%% load, %d cores", used, load * 100 / cores, cores
    }'
    return
  fi

  if [[ "$used_pct" =~ ^[0-9]+$ && "$core_count" =~ ^[0-9]+$ && "$core_count" -gt 0 ]]; then
    printf "%s%% used, %s cores" "$used_pct" "$core_count"
    return
  fi

  if [[ "$load_one" =~ ^[0-9]+([.][0-9]+)?$ && "$core_count" =~ ^[0-9]+$ && "$core_count" -gt 0 ]]; then
    awk -v load="$load_one" -v cores="$core_count" 'BEGIN {
      printf "%.0f%% load, %d cores", load * 100 / cores, cores
    }'
    return
  fi

  printf "unknown"
}

ship="${FLEETMESH_SHIP_NAME:-$(hostname)}"
ip_address="$(local_ip | head -n 1)"
ip_address="${ip_address:-unknown}"

load_one="$(awk '{ print $1 }' /proc/loadavg 2>/dev/null || true)"
if [[ -z "$load_one" ]]; then
  load_one="$(uptime | sed -E 's/.*load averages?: *//; s/,//g' | awk '{ print $1 }')"
fi
cores="$(getconf _NPROCESSORS_ONLN 2>/dev/null || nproc 2>/dev/null || echo "?")"
cpu_text="$(cpu_status "$(cpu_used_pct)" "$load_one" "$cores")"

uptime_text="$(format_uptime "$(uptime_seconds || true)")"

read -r mem_used_kib mem_total_kib mem_pct <<<"$(memory_status || true)"
if [[ "${mem_total_kib:-0}" =~ ^[0-9]+$ && "${mem_total_kib:-0}" -gt 0 ]]; then
  ram_text="$(human_kib "$mem_used_kib") / $(human_kib "$mem_total_kib")  ${mem_pct}%"
else
  ram_text="unknown"
fi

storage_text="$(df -h / | awk 'NR == 2 { print $3 " / " $2 "  " $5 "  " $NF }')"
storage_text="${storage_text:-unknown}"

printf '```\n'
printf '%s\n' "$ship"
printf '%-8s %s\n' "IP" "$ip_address"
printf '%-8s %s\n' "Uptime" "$uptime_text"
printf '%-8s %s\n' "CPU" "$cpu_text"
printf '%-8s %s\n' "RAM" "$ram_text"
printf '%-8s %s\n' "Storage" "$storage_text"
printf '```\n'
