extends Node
## 开局散布 5 个 Shrine，监听 ready 信号，弹 4 选 1。

@export var shrine_scene: PackedScene
@export var count: int = 5
@export var min_distance: float = 18.0
@export var max_distance: float = 40.0
@export var min_separation: float = 12.0

@export var reward_panel_path: NodePath

var _rng: RandomNumberGenerator = RandomNumberGenerator.new()
var _pending_shrine: Node


func _ready() -> void:
	_rng.randomize()
	call_deferred("_spawn_all")


func _spawn_all() -> void:
	if shrine_scene == null:
		return
	var player: Node3D = get_tree().get_first_node_in_group("player") as Node3D
	if player == null:
		return
	var placed: Array = []
	var tries: int = 0
	while placed.size() < count and tries < 200:
		tries += 1
		var a: float = _rng.randf() * TAU
		var r: float = _rng.randf_range(min_distance, max_distance)
		var pos: Vector3 = player.global_position + Vector3(cos(a) * r, 0.0, sin(a) * r)
		pos.y = 0.0
		var ok: bool = true
		for p in placed:
			if (p as Vector3).distance_to(pos) < min_separation:
				ok = false
				break
		if not ok:
			continue
		var sh: Node = shrine_scene.instantiate()
		get_tree().current_scene.add_child(sh)
		(sh as Node3D).global_position = pos
		sh.ready_for_reward.connect(_on_shrine_ready)
		placed.append(pos)


func _on_shrine_ready(shrine: Node) -> void:
	# 如果已经在结算另一个，让它排队（简化：忽略，等结算完自动挂起）
	if _pending_shrine != null:
		return
	_pending_shrine = shrine
	var panel: Node = get_node_or_null(reward_panel_path)
	if panel and panel.has_method("show_options"):
		panel.show_options(_get_luck_level(), _on_reward_picked)


func _get_luck_level() -> int:
	var player: Node = get_tree().get_first_node_in_group("player")
	if player == null:
		return 0
	for t in player.tomes:
		if (t as Dictionary)["type"] == "luck_tome":
			return int((t as Dictionary)["level"])
	return 0


func _on_reward_picked(reward: Dictionary) -> void:
	var player: Node = get_tree().get_first_node_in_group("player")
	if player and player.has_method("apply_shrine_reward"):
		player.apply_shrine_reward(reward)
	if _pending_shrine and is_instance_valid(_pending_shrine):
		_pending_shrine.mark_consumed()
	_pending_shrine = null
