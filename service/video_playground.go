package service

import (
	"fmt"
	"net/url"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

// VideoPlaygroundCapabilitiesFor is a small verified adapter, independent of
// billing schemas. Unknown plugin versions/models fail closed.
func VideoPlaygroundCapabilitiesFor(plugin *jsplugin.LoadedPlugin, name string) (dto.VideoPlaygroundCapabilities, bool) {
	cap := dto.VideoPlaygroundCapabilities{
		SupportedModes: []string{"text_to_video", "image_to_video"},
		Resolutions:    []string{}, Ratios: []string{"16:9", "9:16", "1:1"},
		ImageRoles: []string{"reference_image"}, DurationInputMin: 1,
		DurationInputMax: relaycommon.MaxTaskDurationSeconds, GenerateAudio: true, Watermark: true,
	}
	if plugin == nil {
		return cap, false
	}
	key := plugin.Meta.Key
	if key == "doubao" && plugin.Meta.Version != "1.2.1" || key != "doubao" && plugin.Meta.Version != "1.0.0" {
		return cap, false
	}
	switch key {
	case "doubao":
		switch name {
		case "doubao-seedance-1-0-pro-250528", "doubao-seedance-1-0-lite-t2v", "doubao-seedance-1-0-lite-i2v", "doubao-seedance-1-5-pro-251215", "doubao-seedance-2-5-260628":
			cap.Resolutions = []string{"480p", "720p", "1080p"}
		case "doubao-seedance-2-0-260128":
			cap.Resolutions = []string{"480p", "720p", "1080p", "4k"}
		case "doubao-seedance-2-0-fast-260128", "doubao-seedance-2-0-mini-260615":
			cap.Resolutions = []string{"480p", "720p"}
		default:
			return cap, false
		}
		if name == "doubao-seedance-1-0-lite-t2v" {
			cap.SupportedModes = []string{"text_to_video"}
			cap.ImageRoles = []string{}
		}
		if name == "doubao-seedance-1-0-lite-i2v" {
			cap.SupportedModes = []string{"image_to_video"}
		}
		if slices.Contains([]string{"doubao-seedance-1-0-pro-250528", "doubao-seedance-1-0-lite-i2v", "doubao-seedance-1-5-pro-251215"}, name) {
			cap.ImageRoles = []string{"first_frame"}
		}
		if slices.Contains([]string{"doubao-seedance-1-0-pro-250528", "doubao-seedance-1-0-lite-t2v", "doubao-seedance-1-0-lite-i2v"}, name) {
			cap.GenerateAudio = false
		}
	case "ctyun-cdance":
		cap.DurationRequired, cap.ResolutionRequired = true, true
		switch name {
		case "cdance2.0-0807":
			cap.Resolutions = []string{"480p", "720p", "1080p", "4k"}
		case "cdance2.0-fast-0807", "cdance2.0-mini-0807":
			cap.Resolutions = []string{"480p", "720p"}
		case "cdance2.5-0807", "cdance2.0-0813":
			cap.Resolutions = []string{"480p", "720p", "1080p"}
		default:
			return cap, false
		}
	case "millu-seedance":
		if name != "millu-sd-x-2-5-260801" {
			return cap, false
		}
		cap.Resolutions = []string{"720p", "1080p"}
		cap.Ratios = []string{"21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "adaptive"}
	case "moma-seedance":
		if name != "doubao-seedance-2-0-260128" && name != "doubao-seedance-2.0" {
			return cap, false
		}
		cap.DurationInputMin, cap.DurationInputMax = 4, 15
	default:
		return cap, false
	}
	return cap, true
}

func VideoPlaygroundGroup(userGroup, requested string) (string, []string, error) {
	if requested == "" {
		requested = userGroup
	}
	if !GroupInUserUsableGroups(userGroup, requested) {
		return "", nil, fmt.Errorf("group access denied")
	}
	if requested == "auto" {
		groups := GetUserAutoGroup(userGroup)
		if len(groups) == 0 {
			return "", nil, fmt.Errorf("auto groups are unavailable")
		}
		return requested, groups, nil
	}
	if !IsUserSelectableGroup(userGroup, requested) {
		return "", nil, fmt.Errorf("group is unavailable")
	}
	return requested, []string{requested}, nil
}

// VideoPlaygroundModels enumerates without selecting channels, calling hooks,
// reserving quota, updating affinity, or exposing channel configuration.
func VideoPlaygroundModels(generation *jsplugin.RoutingGeneration, groups []string) ([]dto.VideoPlaygroundModel, error) {
	options := []dto.VideoPlaygroundModel{}
	if generation == nil {
		return options, nil
	}
	abilities, err := model.GetAllEnableAbilityWithChannels()
	if err != nil {
		return nil, err
	}
	ids := []int{}
	seen := make(map[int]struct{})
	for _, ability := range abilities {
		if !slices.Contains(groups, ability.Group) {
			continue
		}
		if _, exists := seen[ability.ChannelId]; exists {
			continue
		}
		seen[ability.ChannelId] = struct{}{}
		ids = append(ids, ability.ChannelId)
	}
	channels, err := model.GetChannelsByIds(ids)
	if err != nil {
		return nil, err
	}
	byID := make(map[int]*model.Channel)
	for _, channel := range channels {
		byID[channel.Id] = channel
	}
	for _, plugin := range generation.Plugins() {
		declared := []string{}
		for _, claim := range plugin.Meta.Protocols {
			if claim.Name != "openai_video" {
				continue
			}
			declared = claim.Models
			if len(declared) == 0 {
				declared = plugin.Meta.Models
			}
		}
		if len(declared) == 0 {
			continue
		}
		filters := []dto.ChannelFilter{{Kind: dto.FilterTaskPluginIdentity, TaskPluginKey: plugin.Meta.Key, TaskPluginChannelTypes: plugin.Meta.ChannelTypes}}
		models := make(map[string][]string)
		invalidMappings := make(map[string]bool)
		for _, name := range declared {
			models[name] = nil
		}
		for _, ability := range abilities {
			if !slices.Contains(groups, ability.Group) {
				continue
			}
			channel := byID[ability.ChannelId]
			if channel == nil || channel.Status != common.ChannelStatusEnabled {
				continue
			}
			if channel.Type == constant.ChannelTypeNewAPI && !plugin.Meta.SupportsUpstream(jsplugin.UpstreamKindNewAPI) {
				continue
			}
			if matches, _ := model.ChannelSatisfiesFilters(channel, ability.Model, filters); !matches {
				continue
			}
			// Use the same mapping resolver as task execution, including chains.
			mapped, mapErr := model.ResolveChannelTaskModel(channel, ability.Model)
			if mapErr != nil {
				invalidMappings[ability.Model] = true
				continue
			}
			mappedDeclared := slices.Contains(declared, mapped)
			endpointMapping := plugin.Meta.Key == "doubao" && strings.HasPrefix(mapped, "ep-") && slices.Contains(declared, ability.Model)
			if !mappedDeclared && !endpointMapping {
				invalidMappings[ability.Model] = true
				continue
			}
			models[ability.Model] = append(models[ability.Model], mapped)
		}
		for name, targets := range models {
			mappedName := name
			if len(targets) > 0 {
				mappedName = targets[0]
			}
			declaredName := mappedName
			// Ark endpoint IDs keep the public model's capability profile.
			if plugin.Meta.Key == "doubao" && strings.HasPrefix(mappedName, "ep-") {
				declaredName = name
			}
			cap, supported := VideoPlaygroundCapabilitiesFor(plugin, declaredName)
			if !supported {
				continue
			}
			option := dto.VideoPlaygroundModel{PluginKey: plugin.Meta.Key, Model: name, DisplayName: plugin.Meta.Name + " · " + name, PluginVersion: plugin.Meta.Version, Capabilities: cap, DeclaredModel: declaredName, Available: true}
			if len(targets) == 0 {
				option.Available = false
				option.DisabledReason = "channel_unavailable"
			}
			for _, target := range targets {
				// A conservative target agreement avoids a union of incompatible
				// capabilities followed by random channel assignment.
				if target != mappedName {
					option.Available = false
					option.DisabledReason = "ambiguous_model_mapping"
				}
				expr, exists := billing_setting.ResolveTaskBillingExpr(plugin.Meta.Key, name, target)
				if exists || billing_setting.GetBillingMode(name) == billing_setting.BillingModeTieredExpr {
					_, compileErr := billingexpr.CompileFromCache(expr)
					validPrice := exists && compileErr == nil && strings.TrimSpace(expr) != "" && !billingexpr.UsesFixedPricing(expr)
					shared := generation.SharedModel(name) || generation.SharedModel(target)
					if validPrice && shared {
						schema, _ := plugin.Meta.UsageForModels(target, name)
						validPrice = billing_setting.TaskExprCompatible(expr, schema)
					}
					if !validPrice {
						option.Available = false
						option.DisabledReason = "model_price_error"
					}
				} else if plugin.Meta.Key == "moma-seedance" {
					option.Available = false
					option.DisabledReason = "model_price_error"
				} else if _, priced := ratio_setting.GetModelPrice(name, false); !priced {
					if _, ratio, _ := ratio_setting.GetModelRatio(name); !ratio {
						option.Available = false
						option.DisabledReason = "model_price_error"
					}
				}
			}
			// These channels remain selectable, so an invalid mapping must block
			// submission even when another channel supplies valid capabilities.
			if invalidMappings[name] {
				option.Available = false
				option.DisabledReason = "ambiguous_model_mapping"
			}
			options = append(options, option)
		}
	}
	slices.SortFunc(options, func(a, b dto.VideoPlaygroundModel) int {
		return strings.Compare(a.PluginKey+"\x00"+a.Model, b.PluginKey+"\x00"+b.Model)
	})
	return options, nil
}

func BuildVideoPlaygroundRequest(request dto.VideoPlaygroundRequest, cap dto.VideoPlaygroundCapabilities) (map[string]any, error) {
	if strings.TrimSpace(request.Prompt) == "" || utf8.RuneCountInString(request.Prompt) > 20000 {
		return nil, fmt.Errorf("prompt must contain between 1 and 20000 characters")
	}
	if len(request.Media) > 1 {
		return nil, fmt.Errorf("only one reference image is supported")
	}
	mode := "text_to_video"
	if len(request.Media) > 0 {
		mode = "image_to_video"
	}
	if !slices.Contains(cap.SupportedModes, mode) {
		return nil, fmt.Errorf("generation mode is not supported by this model")
	}
	p := request.Parameters
	if cap.DurationRequired && p.Duration == nil {
		return nil, fmt.Errorf("duration is required")
	}
	if p.Duration != nil && (*p.Duration < cap.DurationInputMin || *p.Duration > cap.DurationInputMax) {
		return nil, fmt.Errorf("duration exceeds the accepted input bounds")
	}
	if cap.ResolutionRequired && p.Resolution == nil {
		return nil, fmt.Errorf("resolution is required")
	}
	if p.Resolution != nil && !slices.Contains(cap.Resolutions, *p.Resolution) {
		return nil, fmt.Errorf("resolution is not supported by this model")
	}
	if p.Ratio != nil && !slices.Contains(cap.Ratios, *p.Ratio) {
		return nil, fmt.Errorf("ratio is not supported by this model")
	}
	if p.GenerateAudio != nil && !cap.GenerateAudio {
		return nil, fmt.Errorf("audio generation is not supported by this model")
	}
	if p.Watermark != nil && !cap.Watermark {
		return nil, fmt.Errorf("watermark is not supported by this model")
	}
	metadata := map[string]any{}
	if p.Resolution != nil {
		metadata["resolution"] = *p.Resolution
	}
	if p.Ratio != nil {
		metadata["ratio"] = *p.Ratio
	}
	if p.GenerateAudio != nil {
		metadata["generate_audio"] = *p.GenerateAudio
	}
	if p.Watermark != nil {
		metadata["watermark"] = *p.Watermark
	}
	content := []map[string]any{}
	for _, media := range request.Media {
		parsed, err := url.Parse(media.URL)
		if media.Type != "image" || !slices.Contains(cap.ImageRoles, media.Role) {
			return nil, fmt.Errorf("reference image role is not supported")
		}
		if err != nil || parsed.Hostname() == "" || parsed.User != nil || parsed.Fragment != "" || (parsed.Scheme != "http" && parsed.Scheme != "https") || len(media.URL) > 4096 || strings.ContainsAny(media.URL, "\r\n\t \\") {
			return nil, fmt.Errorf("reference image must use an HTTP or HTTPS URL")
		}
		content = append(content, map[string]any{"type": "image_url", "image_url": map[string]any{"url": media.URL}, "role": media.Role})
	}
	if len(content) > 0 {
		metadata["content"] = content
	}
	body := map[string]any{"model": request.Model, "prompt": request.Prompt, "metadata": metadata}
	if p.Duration != nil {
		body["seconds"] = *p.Duration
	}
	return body, nil
}
