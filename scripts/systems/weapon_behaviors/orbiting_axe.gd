extends Node
## Axe: N 把刀刃永久绕玩家旋转，每把独立命中冷却。

var weapon_type: String = "axe"
var player: Node3D
var sfx_key: String = ""

var _blades: Array = []
var _rng: RandomNumberGenerator = RandomNumberGenerator.new()


func _ready() -> void:
	_rng.randomize()
	_refresh_blades()


func _process(delta: float) -> void:
	if player == null:
		return
	var stats: Dictionary = Weapons.get_stats(weapon_type, _get_level())
	if stats.is_empty():
		return

	var count: int = int(stats["projectile_count"])
	if _blades.size() != count:
		_refresh_blades()

	var radius: float = float(stats["range"])
	var angular_speed: float = float(stats["speed"])
	var aoe: float = float(stats["aoe_radius"])
	var damage: float = float(stats["damage"])
	var rehit: float = float(stats["cooldown"])

	for i in _blades.size():
		var blade: Dictionary = _blades[i]
		blade["angle"] = float(blade["angle"]) + angular_speed * delta

		var new_cd: Dictionary = {}
		for eid in blade["hit_cd"]:
			var t: float = float(blade["hit_cd"][eid]) - delta
			if t > 0.0:
				new_cd[eid] = t
		blade["hit_cd"] = new_cd

		var blade_angle: float = float(blade["angle"])
		var blade_pos: Vector3 = player.global_position + Vector3(cos(blade_angle), 0.0, sin(blade_angle)) * radius
		_move_visual(i, blade_pos)

		var hits: Array = WeaponUtil.find_enemies_in_radius(blade_pos, aoe, get_tree())
		for e in hits:
			var eid: int = e.get_instance_id()
			if not blade["hit_cd"].has(eid):
				WeaponUtil.deal_damage(e as Node, damage, player, _rng, blade_pos)
				blade["hit_cd"][eid] = rehit


func _get_level() -> int:
	for w in player.weapons:
		var wd: Dictionary = w as Dictionary
		if wd["type"] == weapon_type:
			return int(wd["level"])
	return 1


func _refresh_blades() -> void:
	for b in _blades:
		var bd: Dictionary = b as Dictionary
		if bd.has("visual") and is_instance_valid(bd["visual"]):
			(bd["visual"] as Node).queue_free()
	_blades.clear()

	var stats: Dictionary = Weapons.get_stats(weapon_type, _get_level())
	if stats.is_empty():
		return
	var count: int = int(stats["projectile_count"])
	for i in count:
		var angle: float = i * TAU / count
		var visual: MeshInstance3D = _make_visual()
		var b: Dictionary = {
			"angle": angle,
			"hit_cd": {},
			"visual": visual,
		}
		_blades.append(b)


func _make_visual() -> MeshInstance3D:
	var m: MeshInstance3D = MeshInstance3D.new()
	var mesh: BoxMesh = BoxMesh.new()
	mesh.size = Vector3(0.4, 0.4, 0.8)
	m.mesh = mesh
	var mat: StandardMaterial3D = StandardMaterial3D.new()
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
	var bd: Dictionary = _blades[idx] as Dictionary
	var v: Variant = bd.get("visual", null)
	if v == null:
		return
	var mi: MeshInstance3D = v as MeshInstance3D
	if is_instance_valid(mi) and mi.is_inside_tree():
		mi.global_position = pos + Vector3(0.0, 1.0, 0.0)
		mi.rotation.y = -float(bd["angle"])


func _exit_tree() -> void:
	for b in _blades:
		var bd: Dictionary = b as Dictionary
		if bd.has("visual") and is_instance_valid(bd["visual"]):
			(bd["visual"] as Node).queue_free()
