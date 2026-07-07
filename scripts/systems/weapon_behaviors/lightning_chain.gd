extends Node
## Lightning Staff: 找一个敌人为起点，连锁 chains 个最近敌人，全瞬发伤害。

var weapon_type: String = "lightning_staff"
var player: Node3D
var sfx_key: String = ""

var _cd_timer: float = 0.0
var _rng: RandomNumberGenerator = RandomNumberGenerator.new()

const CHAIN_JUMP_RADIUS := 8.0


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
	var chains: int = int(stats["chains"])
	var damage: float = float(stats["damage"])

	var first: Node3D = WeaponUtil.find_nearest_enemy(player.global_position, get_tree(), search_range)
	if first == null:
		return

	var hit: Array[Node3D] = [first]
	var last_pos: Vector3 = first.global_position
	WeaponUtil.deal_damage(first, damage, player, _rng, player.global_position)

	for i in chains - 1:
		var next: Node3D = _nearest_unhit(last_pos, hit)
		if next == null:
			break
		hit.append(next)
		WeaponUtil.deal_damage(next, damage, player, _rng, last_pos)
		_spawn_bolt(last_pos, next.global_position)
		last_pos = next.global_position

	# 第一段电从玩家出
	if not hit.is_empty():
		_spawn_bolt(player.global_position + Vector3(0.0, 1.2, 0.0), hit[0].global_position)


func _nearest_unhit(from: Vector3, hit: Array[Node3D]) -> Node3D:
	var best: Node3D = null
	var best_dist: float = CHAIN_JUMP_RADIUS
	for e in get_tree().get_nodes_in_group("enemies"):
		if e in hit or not (e is Node3D):
			continue
		var d: float = (e.global_position - from).length()
		if d < best_dist:
			best = e
			best_dist = d
	return best


func _spawn_bolt(from: Vector3, to: Vector3) -> void:
	var mesh: MeshInstance3D = MeshInstance3D.new()
	var cyl: CylinderMesh = CylinderMesh.new()
	var len: float = from.distance_to(to)
	cyl.height = len
	cyl.top_radius = 0.05
	cyl.bottom_radius = 0.05
	mesh.mesh = cyl
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.albedo_color = Color(0.6, 0.85, 1.0, 0.9)
	mat.emission_enabled = true
	mat.emission = Color(0.6, 0.85, 1.0, 1)
	mat.emission_energy_multiplier = 3.0
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mesh.material_override = mat
	get_tree().current_scene.add_child(mesh)
	var mid: Vector3 = (from + to) * 0.5
	mesh.global_position = mid
	# 让 cylinder Y 轴对准 from→to 方向
	var dir: Vector3 = (to - from).normalized()
	if dir.length() > 0.001:
		var basis: Basis = Basis()
		basis.y = dir
		basis.x = dir.cross(Vector3.UP).normalized() if abs(dir.dot(Vector3.UP)) < 0.99 else Vector3.RIGHT
		basis.z = basis.x.cross(basis.y).normalized()
		mesh.global_transform.basis = basis
	var tw: Tween = get_tree().create_tween()
	tw.tween_property(mat, "emission_energy_multiplier", 0.0, 0.2)
	tw.tween_callback(mesh.queue_free)
