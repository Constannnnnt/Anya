/**
 * @anya-ui/react — Built-in UI Primitives
 *
 * These are the fundamental building blocks the agent combines
 * to construct any UI — the "legos" of Anya UI.
 *
 * All UIs are tools. The agent reasons about which primitives
 * to compose, then constructs the UI from these blocks.
 *
 * Layout:       Container, FlexRow, FlexCol, Section, Card, Timeline, TimelineItem, Divider
 * Content:      Heading, Text, Badge, List, ListItem, Quote, Icon, Label, Link, Avatar
 * Media:        Image, Video, Iframe
 * Interactive:  Button, ButtonGroup, TextInput, Textarea, Select, Checkbox, Toggle,
 *               RadioButton, Slider, SearchInput, Tabs, TabItem, Accordion, AccordionItem
 * Feedback:     Alert, Spinner, Skeleton, ProgressBar, Tooltip, EmptyState
 * Navigation:   Breadcrumbs, Stepper
 * Data:         Table
 * Charts:       BarChart, LineChart, PieChart
 * Diagrams:     Diagram, MermaidDiagram
 */

// ─── Shared ──────────────────────────────────────────────────────────────
export type { PrimitiveBehaviorProps, PrimitiveRenderProps, InteractionTrigger, DynamicInteractions } from './shared';
export { bindDrag } from './shared';

// ─── Layout ──────────────────────────────────────────────────────────────
export { Container } from './Container';
export { FlexRow } from './FlexRow';
export { FlexCol } from './FlexCol';
export { Section } from './Section';
export { Card } from './Card';
export { Divider } from './Divider';
export { Timeline } from './Timeline';
export { TimelineItem } from './TimelineItem';

// ─── Content ─────────────────────────────────────────────────────────────
export { Heading } from './Heading';
export { Text } from './Text';
export { Badge } from './Badge';
export { List } from './List';
export { ListItem } from './ListItem';
export { Quote } from './Quote';
export { Icon } from './Icon';
export { Label } from './Label';
export { Link } from './Link';
export { Avatar } from './Avatar';

// ─── Media ───────────────────────────────────────────────────────────────
export { Image } from './Image';
export { Video } from './Video';
export { Iframe } from './Iframe';

// ─── Interactive ─────────────────────────────────────────────────────────
export { Button } from './Button';
export { ButtonGroup } from './ButtonGroup';
export { TextInput } from './TextInput';
export { Textarea } from './Textarea';
export { Select } from './Select';
export { Checkbox } from './Checkbox';
export { Toggle } from './Toggle';
export { RadioButton } from './RadioButton';
export { Slider } from './Slider';
export { SearchInput } from './SearchInput';
export { Tabs } from './Tabs';
export { TabItem } from './TabItem';
export { Accordion } from './Accordion';
export { AccordionItem } from './AccordionItem';

// ─── Feedback ────────────────────────────────────────────────────────────
export { Alert } from './Alert';
export { Spinner } from './Spinner';
export { Skeleton } from './Skeleton';
export { ProgressBar } from './ProgressBar';
export { Tooltip } from './Tooltip';
export { EmptyState } from './EmptyState';

// ─── Navigation ──────────────────────────────────────────────────────────
export { Breadcrumbs } from './Breadcrumbs';
export { Stepper } from './Stepper';

// ─── Data ────────────────────────────────────────────────────────────────
export { Table } from './Table';

// ─── Charts & Diagrams ──────────────────────────────────────────────────
export { BarChart, LineChart, PieChart, Diagram, MermaidDiagram } from './charts';

// ─── Registry ────────────────────────────────────────────────────────────
import { Container } from './Container';
import { FlexRow } from './FlexRow';
import { FlexCol } from './FlexCol';
import { Section } from './Section';
import { Card } from './Card';
import { Divider } from './Divider';
import { Timeline } from './Timeline';
import { TimelineItem } from './TimelineItem';
import { Heading } from './Heading';
import { Text } from './Text';
import { Badge } from './Badge';
import { List } from './List';
import { ListItem } from './ListItem';
import { Quote } from './Quote';
import { Icon } from './Icon';
import { Label } from './Label';
import { Link } from './Link';
import { Avatar } from './Avatar';
import { Image } from './Image';
import { Video } from './Video';
import { Iframe } from './Iframe';
import { Button } from './Button';
import { ButtonGroup } from './ButtonGroup';
import { TextInput } from './TextInput';
import { Textarea } from './Textarea';
import { Select } from './Select';
import { Checkbox } from './Checkbox';
import { Toggle } from './Toggle';
import { RadioButton } from './RadioButton';
import { Slider } from './Slider';
import { SearchInput } from './SearchInput';
import { Tabs } from './Tabs';
import { TabItem } from './TabItem';
import { Accordion } from './Accordion';
import { AccordionItem } from './AccordionItem';
import { Alert } from './Alert';
import { Spinner } from './Spinner';
import { Skeleton } from './Skeleton';
import { ProgressBar } from './ProgressBar';
import { Tooltip } from './Tooltip';
import { EmptyState } from './EmptyState';
import { Breadcrumbs } from './Breadcrumbs';
import { Stepper } from './Stepper';
import { Table } from './Table';
import { BarChart, LineChart, PieChart, Diagram, MermaidDiagram } from './charts';

/** All built-in primitives as an array — pass to AnyaProvider.components */
export const builtInPrimitives = [
    // Layout
    Container, FlexRow, FlexCol, Section, Card, Divider, Timeline, TimelineItem,
    // Content
    Heading, Text, Badge, List, ListItem, Quote, Icon, Label, Link, Avatar,
    // Media
    Image, Video, Iframe,
    // Interactive
    Button, ButtonGroup, TextInput, Textarea, Select, Checkbox, Toggle,
    RadioButton, Slider, SearchInput, Tabs, TabItem, Accordion, AccordionItem,
    // Feedback
    Alert, Spinner, Skeleton, ProgressBar, Tooltip, EmptyState,
    // Navigation
    Breadcrumbs, Stepper,
    // Data
    Table,
    // Charts & Diagrams
    BarChart, LineChart, PieChart, Diagram, MermaidDiagram,
];
