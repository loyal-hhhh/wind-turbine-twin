# ============ 真实数据接入模板（CSV 转 data.json） ============
# 使用方法：
#   1. 从监测系统导出 CSV，表头必须与下面完全一致（列名见 data/示例数据_CSV.csv）
#   2. 运行：python convert_csv.py 你的数据.csv
#   3. 生成的 data.json 放到 js/ 目录下，然后把 data.js 中的模拟数据改为读取它
#
# CSV 列说明（每行 = 某台风机某个时刻的一条记录）：
#   风机编号   —— F01 / F02 ... （与 windfarms.js 里的 name 一致）
#   时间       —— 2026-10-05 14:00:00
#   风速/功率/转速/状态 —— 运行、待机、故障
#   振动/倾斜/锚索张力/应变/开合度/沉降 —— 6 类传感器实时值

import csv, json, sys, os

def convert(csv_path, out_path='js/data.json'):
    rows = []
    with open(csv_path, newline='', encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            rows.append({
                "name": r["风机编号"],
                "time": r["时间"],
                "windSpeed": float(r["风速"]),
                "power": float(r["功率"]),
                "rotorSpeed": float(r["转速"]),
                "status": r["状态"],
                "sensors": {
                    "vib":    {"val": float(r["振动"]),    "unit": "g",  "limit": 1.6},
                    "tilt":   {"val": float(r["倾斜"]),    "unit": "°",  "limit": 12},
                    "cable":  {"val": float(r["锚索张力"]), "unit": "kN", "limit": 2968.6},
                    "strain": {"val": float(r["应变"]),    "unit": "με", "limit": 2400},
                    "gap":    {"val": float(r["开合度"]),  "unit": "mm", "limit": 80},
                    "settle": {"val": float(r["沉降"]),    "unit": "mm", "limit": 80}
                }
            })
    data = {"turbines": rows, "note": "由 convert_csv.py 从监测系统导出数据转换生成"}
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(f"✅ 转换完成：{len(rows)} 条记录 → {out_path}")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("用法：python convert_csv.py 你的数据.csv [输出路径js/data.json]")
        sys.exit(1)
    convert(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'js/data.json')
