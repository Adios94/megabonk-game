extends Node
## 敌人 spawner。按 Waves 表根据 game_time 切换敌人池 + 刷新参数。

@export var enemy_scene: PackedScene
@export var spawn_ring_min := 15.0
@export var spawn_ring_max := 25.0
@export var target_group := "player"

var _timer := 0.0
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	_rng.randomize()


func _process(delta: float) -> void:
	if enemy_scene == null:
		return

	var t: float = GameManager.run_seconds if GameManager.is_running else 0.0
	var wave: Dictionary = Waves.get_wave_at(t)

	_timer -= delta
	if _timer > 0.0:
		return
	_timer = float(wave["spawn_interval"])

	var alive: int = get_tree().get_nodes_in_group("enemies").size()
	var max_alive: int = int(wave["max_alive"])
	if alive >= max_alive:
		return

	var target := get_tree().get_first_node_in_group(target_group) as Node3D
	if target == null:
		return

	var group_bounds: Array = wave["group_size"]
	var group_size: int = _rng.randi_range(int(group_bounds[0]), int(group_bounds[1]))
	var group_center_angle: float = _rng.randf() * TAU
	var group_radius: float = _rng.randf_range(spawn_ring_min, spawn_ring_max)
	var group_center: Vector3 = target.global_position + Vector3(
		cos(group_center_angle) * group_radius, 0.0, sin(group_center_angle) * group_radius)

	for i in group_size:
		if get_tree().get_nodes_in_group("enemies").size() >= max_alive:
			break
		var enemy_type: String = _pick_enemy_type(wave)
		var elite_mult: float = 1.0
		if _rng.randf() < float(wave["elite_chance"]):
			# 精英：血量 +50%，伤害 +50%
			elite_mult = 1.5
		var pos: Vector3 = group_center + Vector3(
			_rng.randf_range(-2.0, 2.0), 0.0, _rng.randf_range(-2.0, 2.0))
		pos.y = 1.0
		_spawn_one(enemy_type, pos, elite_mult)


func _pick_enemy_type(wave: Dictionary) -> String:
	var candidates: Array = wave["enemies"]
	if candidates.is_empty():
		return "skeleton_soldier"
	# 按 Enemies.spawn_weight 加权抽取
	var total: int = 0
	var t_now: float = GameManager.run_seconds
	var eligible: Array = []
	for enemy_name in candidates:
		var def: Dictionary = Enemies.get_def(enemy_name)
		if def.is_empty():
			continue
		if t_now < float(def.get("first_appear", 0.0)):
			continue
		eligible.append({"name": enemy_name, "weight": int(def.get("spawn_weight", 1))})
		total += int(def.get("spawn_weight", 1))
	if eligible.is_empty():
		return candidates[0]
	var roll: int = _rng.randi_range(0, total - 1)
	for e in eligible:
		roll -= int((e as Dictionary)["weight"])
		if roll < 0:
			return (e as Dictionary)["name"]
	return (eligible[0] as Dictionary)["name"]


func _spawn_one(enemy_type: String, pos: Vector3, elite_mult: float) -> void:
	var enemy: Node3D = enemy_scene.instantiate() as Node3D
	if enemy == null:
		return
	enemy.enemy_type = enemy_type
	get_tree().current_scene.add_child(enemy)
	enemy.global_position = pos
	# Overtime 系数只对 hp/dmg 生效（speed 每帧在 enemy 里应用）
	var bc_script = preload("res://scripts/systems/boss_controller.gd")
	var ot: Dictionary = bc_script.get_overtime_multipliers(GameManager.run_seconds)
	if enemy.has_method("configure_from_type"):
		enemy.configure_from_type(enemy_type, elite_mult)
		enemy.max_hp *= float(ot["hp"])
		enemy.damage *= float(ot["damage"])
		enemy.hp = enemy.max_hp
