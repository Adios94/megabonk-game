extends Node
## 玩家武器管理器。挂在 Player 下面，接收 add_weapon 并 spawn 对应 behavior 节点。

@export var behavior_root_path: NodePath   # 可选，默认自己

var _player: Node3D
var _behaviors: Dictionary = {}   # weapon_type → BehaviorNode


func _ready() -> void:
	_player = get_parent()


func spawn_weapon(weapon_type: String, level: int) -> void:
	if _behaviors.has(weapon_type):
		return
	var behavior_id := Weapons.get_behavior(weapon_type)
	var behavior_scene_path := "res://scripts/systems/weapon_behaviors/%s.gd" % behavior_id
	var script: Script = load(behavior_scene_path)
	if script == null:
		# 尚未实现的武器 —— 静默跳过，M4 再补
		push_warning("[WeaponManager] behavior 未实现: %s (%s)" % [weapon_type, behavior_id])
		return
	var node := Node.new()
	node.set_script(script)
	node.name = "weapon_%s" % weapon_type
	node.set("weapon_type", weapon_type)
	node.set("player", _player)
	add_child(node)
	_behaviors[weapon_type] = node


func get_weapon_level(weapon_type: String) -> int:
	for w in _player.weapons:
		if w["type"] == weapon_type:
			return w["level"]
	return 0


func get_stats(weapon_type: String) -> Dictionary:
	var lv := get_weapon_level(weapon_type)
	if lv <= 0:
		return {}
	return Weapons.get_stats(weapon_type, lv)
