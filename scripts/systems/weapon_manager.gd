extends Node
## 玩家武器管理器。挂在 Player 下面，接收 add_weapon 并 spawn 对应 behavior 节点。

var _player: Node3D
var _behaviors: Dictionary = {}


func _ready() -> void:
	_player = get_parent() as Node3D


func spawn_weapon(weapon_type: String, level: int) -> void:
	if _behaviors.has(weapon_type):
		return
	var behavior_id: String = Weapons.get_behavior(weapon_type)
	if behavior_id.is_empty():
		return
	var behavior_script_path: String = "res://scripts/systems/weapon_behaviors/%s.gd" % behavior_id
	if not ResourceLoader.exists(behavior_script_path):
		push_warning("[WeaponManager] behavior 未实现: %s (%s)" % [weapon_type, behavior_id])
		return
	var script: Script = load(behavior_script_path) as Script
	if script == null:
		push_warning("[WeaponManager] 无法加载 behavior 脚本: %s" % behavior_script_path)
		return
	var node: Node = Node.new()
	node.set_script(script)
	node.name = "weapon_%s" % weapon_type
	node.set("weapon_type", weapon_type)
	node.set("player", _player)
	add_child(node)
	_behaviors[weapon_type] = node


func get_weapon_level(weapon_type: String) -> int:
	for w in _player.weapons:
		var wd: Dictionary = w as Dictionary
		if wd["type"] == weapon_type:
			return int(wd["level"])
	return 0


func get_stats(weapon_type: String) -> Dictionary:
	var lv: int = get_weapon_level(weapon_type)
	if lv <= 0:
		return {}
	return Weapons.get_stats(weapon_type, lv)
