extends Node
## Ray Gun: 瞬发激光沿直线，穿透所有敌人。range = 索敌距离；aoe_radius = 半宽。

var weapon_type: String = "ray_gun"
var player: Node3D
var sfx_key: String = ""

var _cd_timer: float = 0.0
var _rng: RandomNumberGenerator = RandomNumberGenerator.new()


func _ready() -> void:
	_rng.randomize()


func _process(delta: float) -> void:
	if player == null:
		return
	var stats: Dictionary = Weapons.get_stats(weapon_type, _get_level())
	if stats.is_empty():
		return
	_cd_timer -= delta * float(player.attack_speed_mult)
	if _cd_timer > 0.0:
		return
	_cd_timer = float(stats["cooldown"])
	if sfx_key != "": Audio.play_sfx(sfx_key, 0.1)
	_fire(stats)


func _get_level() -> int:
	for w in player.weapons:
		var wd: Dictionary = w as Dictionary
		if wd["type"] == weapon_type:
			return int(wd["level"])
	return 1


func _fire(stats: Dictionary) -> void:
	var search_range: float = float(stats["range"])
	var target: Node3D = WeaponUtil.find_nearest_enemy(player.global_position, get_tree(), search_range)
	if target == null:
		return

	var beam_length: float = 60.0
	var half_width: float = float(stats["aoe_radius"]) * 0.3125
	var damage: float = float(stats["damage"])
	var start: Vector3 = player.global_position + Vector3(0.0, 1.0, 0.0)
	var dir: Vector3 = (target.global_position - start)
	dir.y = 0.0
	if dir.length() < 0.1:
		return
	dir = dir.normalized()
	var end: Vector3 = start + dir * beam_length

	# 光束半宽 * 半径的胶囊范围 → 简化为每 1.5m 采样一个圆
	var samples: int = 20
	var hit_ids: Dictionary = {}
	for i in samples:
		var t: float = float(i) / samples
		var pt: Vector3 = start.lerp(end, t)
		for e in WeaponUtil.find_enemies_in_radius(pt, half_width, get_tree()):
			var eid: int = e.get_instance_id()
			if hit_ids.has(eid):
				continue
			hit_ids[eid] = true
			WeaponUtil.deal_damage(e as Node, damage, player, _rng, start)

	_spawn_beam(start, end, half_width)


func _spawn_beam(from: Vector3, to: Vector3, half_width: float) -> void:
	var mesh: MeshInstance3D = MeshInstance3D.new()
	var cyl: CylinderMesh = CylinderMesh.new()
	cyl.height = from.distance_to(to)
	cyl.top_radius = half_width
	cyl.bottom_radius = half_width
	mesh.mesh = cyl
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.albedo_color = Color(1.0, 0.35, 0.35, 0.85)
	mat.emission_enabled = true
	mat.emission = Color(1.0, 0.35, 0.35, 1)
	mat.emission_energy_multiplier = 3.0
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mesh.material_override = mat
	get_tree().current_scene.add_child(mesh)
	mesh.global_position = (from + to) * 0.5
	var dir: Vector3 = (to - from).normalized()
	if dir.length() > 0.001:
		var basis: Basis = Basis()
		basis.y = dir
		basis.x = dir.cross(Vector3.UP).normalized() if abs(dir.dot(Vector3.UP)) < 0.99 else Vector3.RIGHT
		basis.z = basis.x.cross(basis.y).normalized()
		mesh.global_transform.basis = basis
	var tw: Tween = get_tree().create_tween()
	tw.tween_property(mat, "albedo_color:a", 0.0, 0.12)
	tw.tween_callback(mesh.queue_free)
