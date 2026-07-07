extends Node3D
## 角色 / 敌人动画播放器。挂在包含 GLB 实例的 Model 节点上（自动找子孙 AnimationPlayer）。
## 用法：
##   var rig: AnimationRig = ...
##   rig.set_owner_body(owner_body)  # 主体节点（CharacterBody3D），用于读 velocity
## 状态：idle / walk / run / hit / death / attack
## 每帧根据 owner_body.velocity 长度决定 idle→walk→run；
## take_damage/die 由外部显式调 play_hit / play_death。

@export var idle_clip: String = "Idle"
@export var walk_clip: String = "Walk"
@export var run_clip: String = "Run"
@export var hit_clip: String = "HitRecieve_1"
@export var death_clip: String = "Death"
@export var attack_clip: String = "SwordSlash"

# 阈值：velocity horizontal length
@export var walk_threshold: float = 0.1
@export var run_threshold: float = 3.5

var _anim: AnimationPlayer
var _owner_body: Node
var _current_state: String = ""
var _hit_timer: float = 0.0
var _dead: bool = false


func _ready() -> void:
	_anim = _find_animation_player(self)
	# 静默 fallback：没找到就啥也不干
	if _anim:
		_play("idle")


func set_owner_body(body: Node) -> void:
	_owner_body = body


func _process(delta: float) -> void:
	if _dead or _anim == null:
		return
	_hit_timer = maxf(0.0, _hit_timer - delta)
	if _hit_timer > 0.0:
		return
	# 根据 velocity 切 idle/walk/run
	if _owner_body == null:
		return
	var v_raw: Variant = _owner_body.get("velocity")
	if v_raw == null:
		return
	var v: Vector3 = v_raw as Vector3
	var horiz: float = Vector2(v.x, v.z).length()
	if horiz > run_threshold:
		_play("run")
	elif horiz > walk_threshold:
		_play("walk")
	else:
		_play("idle")


func play_hit() -> void:
	if _dead or _anim == null:
		return
	if not _anim.has_animation(hit_clip):
		return
	_anim.play(hit_clip)
	_current_state = "hit"
	_hit_timer = 0.35


func play_attack() -> void:
	if _dead or _anim == null:
		return
	if not _anim.has_animation(attack_clip):
		return
	_anim.play(attack_clip)
	_current_state = "attack"
	_hit_timer = 0.4


func play_death() -> void:
	if _anim == null:
		_dead = true
		return
	_dead = true
	if _anim.has_animation(death_clip):
		_anim.play(death_clip)


func _play(state: String) -> void:
	if _current_state == state:
		return
	var clip: String = ""
	match state:
		"idle": clip = idle_clip
		"walk": clip = walk_clip
		"run": clip = run_clip
	if clip.is_empty() or not _anim.has_animation(clip):
		# fallback：随便播个存在的循环 clip
		var list: PackedStringArray = _anim.get_animation_list()
		if list.is_empty():
			return
		clip = list[0]
	_anim.play(clip)
	_current_state = state


func _find_animation_player(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node
	for c in node.get_children():
		var r: AnimationPlayer = _find_animation_player(c)
		if r:
			return r
	return null
