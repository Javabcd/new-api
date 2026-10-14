package dto

// VideoPlaygroundRequest is a closed UI contract, never an upstream payload.
type VideoPlaygroundRequest struct {
	PluginKey  string                    `json:"plugin_key"`
	Model      string                    `json:"model"`
	Group      string                    `json:"group"`
	Prompt     string                    `json:"prompt"`
	Media      []VideoPlaygroundMedia    `json:"media,omitempty"`
	Parameters VideoPlaygroundParameters `json:"parameters"`
}

type VideoPlaygroundMedia struct {
	Type string `json:"type"`
	URL  string `json:"url"`
	Role string `json:"role"`
}

type VideoPlaygroundParameters struct {
	Duration      *int    `json:"duration,omitempty"`
	Resolution    *string `json:"resolution,omitempty"`
	Ratio         *string `json:"ratio,omitempty"`
	GenerateAudio *bool   `json:"generate_audio,omitempty"`
	Watermark     *bool   `json:"watermark,omitempty"`
}

type VideoPlaygroundCapabilities struct {
	SupportedModes     []string `json:"supported_modes"`
	Resolutions        []string `json:"resolutions"`
	Ratios             []string `json:"ratios"`
	ImageRoles         []string `json:"image_roles"`
	DurationRequired   bool     `json:"duration_required"`
	ResolutionRequired bool     `json:"resolution_required"`
	// Input safety bounds are not a claim about provider generation limits.
	DurationInputMin int  `json:"duration_input_min"`
	DurationInputMax int  `json:"duration_input_max"`
	GenerateAudio    bool `json:"generate_audio"`
	Watermark        bool `json:"watermark"`
}

type VideoPlaygroundModel struct {
	PluginKey      string                      `json:"plugin_key"`
	Model          string                      `json:"model"`
	DisplayName    string                      `json:"display_name"`
	PluginVersion  string                      `json:"plugin_version"`
	Capabilities   VideoPlaygroundCapabilities `json:"capabilities"`
	Available      bool                        `json:"available"`
	DisabledReason string                      `json:"disabled_reason,omitempty"`
	// DeclaredModel is internal validation identity; aliases stay public.
	DeclaredModel string `json:"-"`
}
