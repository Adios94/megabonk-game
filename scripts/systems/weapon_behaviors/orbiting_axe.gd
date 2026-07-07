extends Node
## Axe: N 把刀刃永久绕玩家旋转，每把独立命中/冷却。

var weapon_type: String = "axe"
var player: Node3D

var _blades: Array = []   # [ { "angle": float, "hit_cd": {enemy_id: float} } ]
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	_rng.randomize()
	_refresh_blades()


func _process(delta: float) -> void:
	if player == null:
		return
	var stats: Dictionary = Weapons.get_stats(weapon_type, _get_level())
	if stats.is_empty():
		return

	# 数量变化 → 重建
	if _blades.size() != int(stats["projectile_count"]):
		_refresh_blades()

	var radius: float = stats["range"]
	var angular_speed: float = stats["speed"]
	var aoe: float = stats["aoe_radius"]
	var damage: float = stats["damage"]
	var rehit: float = stats["cooldown"]

	for i in _blades.size():
		var blade: Dictionary = _blades[i]
		blade["angle"] += angular_speed * delta

		# 递减重击冷却
		var new_cd: Dictionary = {}
		for eid in blade["hit_cd"]:
			var t: float = blade["hit_cd"][eid] - delta
			if t > 0.0:
				new_cd[eid] = t
		blade["hit_cd"] = new_cd

		var blade_pos := player.global_position + Vector3(cos(blade["angle"]), 0.0, sin(blade["angle"])) * radius
		_move_visual(i, blade_pos)

		var hits := WeaponUtil.find_enemies_in_radius(blade_pos, aoe, get_tree())
		for e in hits:
			var eid := e.get_instance_id()
			if not blade["hit_cd"].has(eid):
				WeaponUtil.deal_damage(e, damage, player, _rng, blade_pos)
				blade["hit_cd"][eid] = rehit


func _get_level() -> int:
	for w in player.weapons:
		if w["type"] == weapon_type:
			return w["level"]
	return 1


func _refresh_blades() -> void:
	for b in _blades:
		if b.has("visual") and is_instance_valid(b["visual"]):
			b["visual"].queue_free()
	_blades.clear()

	var stats: Dictionary = Weapons.get_stats(weapon_type, _get_level())
	if stats.is_empty():
		return
	var count: int = stats["projectile_count"]
	for i in count:
		var angle := i * TAU / count
		var visual := _make_visual()
		var b := {
			"angle": angle,
			"hit_cd": {},
			"visual": visual,
		}
		_blades.append(b)


func _make_visual() -> MeshInstance3D:
	var m := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = Vector3(0.4, 0.4, 0.8)
	m.mesh = mesh
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.7, 0.7, 0.75)
	mat.metallic = 0.8
	m.material_override = mat
	call_deferred("_attach_visual", m)
	return m


func _attach_visual(m: MeshInstance3D) -> void:
	get_tree().current_scene.add_child(m)


func _move_visual(idx: int, pos: Vector3) -> void:
	if idx >= _blades.size():
		return
	var v = _blades[idx].get("visual", null)
	if v and is_instance_valid(v) and v.is_inside_tree():
		v.global_position = pos + Vector3(0.0, 1.0, 0.0)
		v.rotation.y = -_blades[idx]["angle"]


func _exit_tree() -> void:
	for b in _blades:
		if b.has("visual") and is_instance_valid(b["visual"]):
			b["visual"].queue_free()
