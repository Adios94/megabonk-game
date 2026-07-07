## 全局常量 & 通用数值。旧版 config.ts 顶层常量的 GDScript 版本。
class_name GameConfig
extends RefCounted

# --- 玩家 ---
const PLAYER_BASE_HP := 100.0
const PLAYER_BASE_SPEED := 4.0
const PLAYER_MOVE_SPEED_MULTIPLIER := 1.6
const PLAYER_BASE_CRIT_CHANCE := 0.05
const PLAYER_BASE_CRIT_DAMAGE := 1.5
const PLAYER_PICKUP_RADIUS := 2.0
const PLAYER_INVINCIBLE_DURATION := 0.5

# 移动
const JUMP_FORCE := 6.0
const GRAVITY := 18.0
const SLIDE_DURATION := 0.5
const SLIDE_COOLDOWN := 0.3
const BUNNY_HOP_WINDOW := 0.15
const BUNNY_HOP_BONUS := 1.2

# XP
const XP_BASE := 10
const XP_GROWTH := 0.35
const MAX_LEVEL := 100
const ACTIVE_WEAPON_SLOTS_INRUN_MAX := 5
const MAX_WEAPONS_CAP := 6
const WEAPON_MAX_LEVEL := 10

# 局内节奏
const BOSS_SPAWN_TIME := 540.0
const BOSS_HP := 30000.0
const REGULAR_GAME_DURATION := 540.0
const FINAL_SWARM_START_TIME := 480.0
const FINAL_SWARM_SPEED_MULTIPLIER := 1.3

# 拾取
const PICKUP_LIFETIME := 30.0
const PICKUP_ATTRACT_SPEED := 12.0
const HEALTH_DROP_CHANCE := 0.03
const HEALTH_SMALL_DROP_CHANCE := 0.08

# 世界
const MAP_SIZE := 120.0
const MAX_ENEMIES := 100
const MAX_PROJECTILES := 200
const MAX_PICKUPS := 300
const AOE_MAX_Y_DELTA := 1.2

# Shrine
const SHRINE_COUNT := 5
const SHRINE_RADIUS := 2.5
const SHRINE_CHARGE_DURATION := 4.0
const SHRINE_REWARD_COUNT := 4
const SHIELD_REGEN_RATE := 5.0
const SHIELD_REGEN_DELAY := 3.0

# 武器辅助
const ELITE_SLOW_COEF := 0.5


static func xp_for_level(lv: int) -> int:
	# 与旧版 upgrades.ts xpForLevel 一致：
	# L≤10 线性；L 11-40 加二次项；L>40 指数
	const XP_STEEPEN_START := 10
	const XP_CURVE_BREAK := 40
	const XP_MID_QUAD := 0.5
	const XP_LATE_GROWTH := 1.0725
	if lv <= XP_CURVE_BREAK:
		return int(floor(_xp_midgame(lv)))
	var base := _xp_midgame(XP_CURVE_BREAK)
	return int(floor(base * pow(XP_LATE_GROWTH, lv - XP_CURVE_BREAK)))


static func _xp_midgame(lv: int) -> float:
	const XP_STEEPEN_START := 10
	const XP_MID_QUAD := 0.5
	var linear := XP_BASE * (1.0 + lv * XP_GROWTH)
	if lv <= XP_STEEPEN_START:
		return linear
	var steep := lv - XP_STEEPEN_START
	return linear + steep * steep * XP_MID_QUAD


static func compute_weapon_slots(level: int, max_slots: int) -> int:
	var slots: int = 1
	if level >= 5: slots += 1
	if level >= 10: slots += 1
	if level >= 20: slots += 1
	if level >= 30: slots += 1
	if level >= 50 and max_slots >= MAX_WEAPONS_CAP: slots += 1
	return mini(max_slots, slots)
