extends Node
## 音频管理器。加载所有 SFX 和 BGM，提供 play_sfx / play_music / set_volume。
## SFX 用 pool 复用 AudioStreamPlayer，避免频繁 new。

const SFX_POOL_SIZE := 12
const MUSIC_BUS := "Music"
const SFX_BUS := "SFX"

# name → AudioStream 映射（在 _ready 里 preload）
var _sfx: Dictionary = {}
var _music: Dictionary = {}

var _sfx_players: Array = []
var _music_player: AudioStreamPlayer

var _sfx_volume: float = 1.0
var _music_volume: float = 0.6


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_load_sfx()
	_load_music()
	_build_pool()


func _load_sfx() -> void:
	# name → path 映射
	var map: Dictionary = {
		# weapons
		"weapon_sword": "res://assets/audio/sfx/weapons/sword.mp3",
		"weapon_bone": "res://assets/audio/sfx/weapons/bone.mp3",
		"weapon_gun": "res://assets/audio/sfx/weapons/gun.mp3",
		"weapon_lightning": "res://assets/audio/sfx/weapons/lightning.mp3",
		"weapon_firering": "res://assets/audio/sfx/weapons/firering.mp3",
		"weapon_burn": "res://assets/audio/sfx/weapons/burn.mp3",
		"weapon_magic": "res://assets/audio/sfx/weapons/magic.mp3",
		"weapon_raygun": "res://assets/audio/sfx/weapons/raygun.mp3",
		"weapon_poison": "res://assets/audio/sfx/weapons/poison.mp3",
		"weapon_needle": "res://assets/audio/sfx/weapons/needle.mp3",
		"weapon_ripple": "res://assets/audio/sfx/weapons/ripple.mp3",
		# enemies
		"enemy_hit": "res://assets/audio/sfx/enemies/hit.mp3",
		# player
		"player_hurt": "res://assets/audio/sfx/player/hurt.mp3",
		"player_fall": "res://assets/audio/sfx/player/fall.mp3",
		"player_levelup": "res://assets/audio/sfx/player/levelup.mp3",
		"player_gameover": "res://assets/audio/sfx/player/gameover.mp3",
		# pickups
		"pickup_getexp": "res://assets/audio/sfx/pickups/getexp.mp3",
		"pickup_eat": "res://assets/audio/sfx/pickups/eat.mp3",
		"pickup_openchest": "res://assets/audio/sfx/pickups/openchest.mp3",
		# boss
		"boss_alarm": "res://assets/audio/sfx/boss/bossalarm.mp3",
		"boss_attack": "res://assets/audio/sfx/boss/bossAttack.mp3",
		"boss_loading": "res://assets/audio/sfx/boss/bossloading.mp3",
		# world
		"world_level2": "res://assets/audio/sfx/world/level2.mp3",
		"world_powerup": "res://assets/audio/sfx/world/powerup.mp3",
		# ui
		"ui_click": "res://assets/audio/sfx/ui/click.mp3",
		"ui_select": "res://assets/audio/sfx/ui/select.mp3",
	}
	for key in map:
		var path: String = map[key]
		if ResourceLoader.exists(path):
			_sfx[key] = load(path)


func _load_music() -> void:
	var map: Dictionary = {
		"begin": "res://assets/audio/music/begin.mp3",
		"fight1": "res://assets/audio/music/fight1.mp3",
	}
	for key in map:
		var path: String = map[key]
		if ResourceLoader.exists(path):
			_music[key] = load(path)


func _build_pool() -> void:
	for i in SFX_POOL_SIZE:
		var p: AudioStreamPlayer = AudioStreamPlayer.new()
		p.name = "SfxPlayer%d" % i
		p.bus = "Master"
		add_child(p)
		_sfx_players.append(p)
	_music_player = AudioStreamPlayer.new()
	_music_player.name = "MusicPlayer"
	_music_player.bus = "Master"
	add_child(_music_player)


func play_sfx(key: String, pitch_variation: float = 0.0) -> void:
	if not _sfx.has(key):
		return
	var stream: AudioStream = _sfx[key] as AudioStream
	# 找空闲 player
	var player: AudioStreamPlayer = null
	for p in _sfx_players:
		if not (p as AudioStreamPlayer).playing:
			player = p
			break
	if player == null:
		player = _sfx_players[0] as AudioStreamPlayer
	player.stream = stream
	player.volume_db = linear_to_db(_sfx_volume)
	if pitch_variation > 0.0:
		player.pitch_scale = 1.0 + randf_range(-pitch_variation, pitch_variation)
	else:
		player.pitch_scale = 1.0
	player.play()


func play_music(key: String, fade_in: float = 0.5) -> void:
	if not _music.has(key):
		return
	var stream: AudioStream = _music[key] as AudioStream
	# 已经是这首就不动
	if _music_player.stream == stream and _music_player.playing:
		return
	_music_player.stop()
	_music_player.stream = stream
	if stream is AudioStreamMP3:
		(stream as AudioStreamMP3).loop = true
	_music_player.volume_db = linear_to_db(_music_volume * 0.01) if fade_in > 0.0 else linear_to_db(_music_volume)
	_music_player.play()
	if fade_in > 0.0:
		var tw: Tween = create_tween()
		tw.tween_property(_music_player, "volume_db", linear_to_db(_music_volume), fade_in)


func stop_music(fade_out: float = 0.5) -> void:
	if fade_out <= 0.0:
		_music_player.stop()
		return
	var tw: Tween = create_tween()
	tw.tween_property(_music_player, "volume_db", linear_to_db(0.001), fade_out)
	tw.tween_callback(_music_player.stop)


func set_sfx_volume(v: float) -> void:
	_sfx_volume = clampf(v, 0.0, 1.0)


func set_music_volume(v: float) -> void:
	_music_volume = clampf(v, 0.0, 1.0)
	_music_player.volume_db = linear_to_db(_music_volume)


func get_sfx_volume() -> float:
	return _sfx_volume


func get_music_volume() -> float:
	return _music_volume
